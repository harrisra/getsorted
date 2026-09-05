import json
import re

import requests
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import GroceryItem, GroceryItemPrice, Store, is_trolley_url
from .serializers import (
    GroceryItemSerializer,
    PopulateFromTrolleyRequestSerializer,
    RefreshPriceRequestSerializer,
    StoreSerializer,
)

SCRAPE_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0 Safari/537.36"
)

# Bounds a trolley.co.uk page down to just its per-store comparison table —
# from its opening tag to the next top-level </section> (holds true across
# every product page checked; see _extract_store_rows for why this scoping
# matters).
COMPARISON_TABLE_RE = re.compile(r'class="comparison-table".*?</section>', re.DOTALL)

# One row of that table: a store's logo/title, that store's regular price,
# and — if trolley.co.uk shows one — a promotional/loyalty-card offer badge
# right after it, e.g. "95P CLUBCARD" or "£4 NECTAR" (see _parse_offer_price).
# Prices are seen written both as a plain "£" character and as the
# "&pound;" HTML entity (observed to differ between pages), so both are
# matched; the price may or may not be wrapped in <b>. The `.*?</div></div>`
# after the price is the closing of its per-100g-price sub-div and the price
# div itself — reaching exactly there (not further) before optionally
# checking for an offer badge is what keeps this from accidentally picking
# up a later row's offer when this row has none.
STORE_ROW_RE = re.compile(
    r'<svg title="([^"]+)" class="store-logo[^"]*">.*?'
    r'class="_price">\s*(?:<b>)?(?:&pound;|£)\s*([\d,]+\.\d{2}).*?</div></div>'
    r'(?:<div class="_product-offer">([^<]*)</div>)?',
    re.DOTALL,
)

# A price inside a store's offer badge text, e.g. "95P CLUBCARD" (pence, no
# decimal) or "£4 NECTAR"/"£1.50 NECTAR PRICE" (pounds). Some offer badges
# have no extractable price at all (e.g. "20% OFF", "BUY ONE GET ONE FREE")
# — see _parse_offer_price.
OFFER_PRICE_RE = re.compile(r"(?:&pound;|£)\s*(\d+(?:\.\d{2})?)|(\d+)p\b", re.IGNORECASE)

# trolley.co.uk's own schema.org Product block, e.g.
# {"@type": "Product", "name": "Cathedral City Extra Mature Cheddar Cheese
# (550g)", "image": ["https://www.trolley.co.uk/img/product/WIB886"], ...} —
# used by populate_from_trolley for the product's name/size/image (its
# "offers.price" is NOT used — see _extract_store_rows for why a single
# price isn't trustworthy).
JSON_LD_RE = re.compile(r'<script type="application/ld\+json">(.*?)</script>', re.DOTALL)

# A product's size, embedded in trolley.co.uk's own name for it as a
# trailing parenthetical, e.g. "... Cheddar Cheese (550g)" or "... Curry
# Sauce (350g)" — split out into (base name, size text).
NAME_SIZE_RE = re.compile(r"^(.*?)\s*\(([^()]+)\)\s*$")

# The size text itself, e.g. "350g", "1.5kg", "500ml", "6 pack".
SIZE_RE = re.compile(
    r"(\d+(?:\.\d+)?)\s*(kg|g|litres?|l|ml)\b|(\d+)\s*(?:x|pack|pieces?|pcs?)\b", re.IGNORECASE
)


def _parse_offer_price(text):
    """Best-effort price from a store's promotional-offer badge text, e.g.
    "95P CLUBCARD" -> "0.95", "£4 NECTAR" -> "4.00". None if the text
    doesn't contain a recognizable price (e.g. "20% OFF")."""
    if not text:
        return None
    match = OFFER_PRICE_RE.search(text)
    if not match:
        return None
    pounds, pence = match.group(1), match.group(2)
    if pounds is not None:
        return f"{float(pounds):.2f}"
    return f"{int(pence) / 100:.2f}"


def _normalize_store_name(name):
    """Lowercase, alphanumeric-only comparison key so store names that
    differ only in punctuation/spacing still match, e.g. trolley.co.uk's
    "Sainsbury's" against this app's "Sainsburys", or "Co-op" against
    "Coop"."""
    return re.sub(r"[^a-z0-9]", "", name.lower())


def _fetch_trolley_page(trolley_url):
    """Fetch a trolley.co.uk product page's raw HTML.

    Returns (html, error): exactly one is None. `error` is a (response_body,
    http_status) pair ready to hand straight to Response(*error).
    """
    if not is_trolley_url(trolley_url):
        return None, (
            {"trolley_url": ["Must be a trolley.co.uk product page."]},
            status.HTTP_400_BAD_REQUEST,
        )

    try:
        response = requests.get(trolley_url, headers={"User-Agent": SCRAPE_USER_AGENT}, timeout=15)
        response.raise_for_status()
    except requests.RequestException:
        return None, (
            {"detail": "Could not reach trolley.co.uk. Try again later."},
            status.HTTP_502_BAD_GATEWAY,
        )
    return response.text, None


def _extract_store_rows(html):
    """Every store's current price for a product, from an already-fetched
    trolley.co.uk page.

    trolley.co.uk price-compares one product across several supermarkets on
    a single page. Its schema.org Product/Offer JSON-LD block — which looked
    like the obvious thing to parse — only ever gives the single CHEAPEST
    price across every store listed, not each store's own price: confirmed
    by hand against
    https://www.trolley.co.uk/product/loyd-grossman-tikka-masala-sauce/XVR292,
    where the JSON-LD price (£2.84, Asda/Amazon) differs from Tesco's own row
    on that same page (£3.00).

    So instead this walks the page's own per-store comparison table (each
    row: a store logo/title, that store's price, and an optional
    promotional-offer badge) and returns every row found there, for the
    caller to match against the app's own Store list.

    Returns (rows, error): exactly one is None. `rows` is a list of
    (store_name, price, promo_price) tuples — price a decimal string e.g.
    "0.85", promo_price the same or None if this store has no current offer
    (or the offer badge had no extractable price, e.g. "20% OFF").
    """
    # Scoped to just the comparison table, not the whole page — trolley.co.uk
    # also has "alternative products" widgets elsewhere on the page using the
    # same _price/store-logo markup for entirely different products, which
    # would otherwise be a second way to pick up the wrong price.
    table_match = COMPARISON_TABLE_RE.search(html)
    if not table_match:
        return None, (
            {"detail": "Could not find a price comparison table on that trolley.co.uk page."},
            status.HTTP_502_BAD_GATEWAY,
        )

    rows = [
        (row_store, price.replace(",", ""), _parse_offer_price(offer_text))
        for row_store, price, offer_text in STORE_ROW_RE.findall(table_match.group(0))
    ]
    return rows, None


def _scrape_trolley_prices(trolley_url):
    """Fetch + extract every store's current price for a product from its
    trolley.co.uk page — see _fetch_trolley_page/_extract_store_rows."""
    html, error = _fetch_trolley_page(trolley_url)
    if error:
        return None, error
    return _extract_store_rows(html)


def _parse_size(text):
    """Best-effort grams/pieces/milliliters from a free-text size string
    such as '350g', '1.5kg', '500ml', '6 pack'. Returns (grams, pieces,
    milliliters), each None if nothing matched."""
    if not text:
        return None, None, None
    match = SIZE_RE.search(text)
    if not match:
        return None, None, None
    amount, unit, count = match.group(1), match.group(2), match.group(3)
    if count is not None:
        return None, int(count), None
    amount = float(amount)
    unit = unit.lower()
    if unit == "kg":
        return round(amount * 1000), None, None
    if unit == "g":
        return round(amount), None, None
    if unit in ("l", "litre", "litres"):
        return None, None, round(amount * 1000)
    if unit == "ml":
        return None, None, round(amount)
    return None, None, None


def _split_name_and_size(raw_name):
    """trolley.co.uk's own product names embed size as a trailing
    parenthetical, e.g. "Cathedral City Extra Mature Cheddar Cheese
    (550g)" — split that into a name matching this app's own convention
    (e.g. "... Cheddar Cheese 550g", no parens) plus the separate size
    fields GroceryItem expects. Returns (name, grams, pieces, milliliters);
    if the parenthetical isn't a recognizable size (e.g. a flavor variant),
    returns the name unchanged and every size field None, rather than
    silently dropping it.
    """
    match = NAME_SIZE_RE.match(raw_name)
    if not match:
        return raw_name, None, None, None
    base_name, size_text = match.group(1).strip(), match.group(2).strip()
    grams, pieces, milliliters = _parse_size(size_text)
    if grams is None and pieces is None and milliliters is None:
        return raw_name, None, None, None
    return f"{base_name} {size_text}", grams, pieces, milliliters


def _scrape_trolley_product(trolley_url):
    """Fetch a trolley.co.uk product page's name, size, image, and every
    store's current price for it — everything populate_from_trolley needs
    to create a fully-populated GroceryItem from just that one URL.

    Returns (data, error): exactly one is None. `data` is
    {"name", "grams", "pieces", "milliliters", "image_url", "store_prices"}
    — store_prices is the same (store_name, price, promo_price) list
    _scrape_trolley_prices returns; empty (not an error) if the page's
    comparison table couldn't be found, since the product details alone are
    still worth creating an item from.
    """
    html, error = _fetch_trolley_page(trolley_url)
    if error:
        return None, error

    json_ld_match = JSON_LD_RE.search(html)
    if not json_ld_match:
        return None, (
            {"detail": "Could not find product details on that trolley.co.uk page."},
            status.HTTP_502_BAD_GATEWAY,
        )
    try:
        product = json.loads(json_ld_match.group(1))
    except ValueError:
        return None, (
            {"detail": "Could not parse product details from that trolley.co.uk page."},
            status.HTTP_502_BAD_GATEWAY,
        )

    raw_name = (product.get("name") or "").strip()
    if not raw_name:
        return None, (
            {"detail": "Could not determine the product name from that trolley.co.uk page."},
            status.HTTP_502_BAD_GATEWAY,
        )
    name, grams, pieces, milliliters = _split_name_and_size(raw_name)

    image_url = ""
    images = product.get("image")
    if isinstance(images, list) and images:
        image_url = images[0]
    elif isinstance(images, str):
        image_url = images

    store_prices, _rows_error = _extract_store_rows(html)

    return {
        "name": name,
        "grams": grams,
        "pieces": pieces,
        "milliliters": milliliters,
        "image_url": image_url,
        "store_prices": store_prices or [],
    }, None


class StoreViewSet(viewsets.ReadOnlyModelViewSet):
    """The fixed list of stores grocery items can be assigned to."""

    queryset = Store.objects.all()
    serializer_class = StoreSerializer
    permission_classes = [IsAuthenticated]


class GroceryItemViewSet(viewsets.ModelViewSet):
    """Shared, app-wide grocery catalog. Any signed-in user can view, add,
    and edit entries; only the account that created an entry can delete it.
    """

    queryset = GroceryItem.objects.all()
    serializer_class = GroceryItemSerializer
    permission_classes = [IsAuthenticated]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def perform_destroy(self, instance):
        # created_by can be null (the creator's account was later deleted —
        # see settings.AUTH_USER_MODEL's on_delete=SET_NULL) — with no
        # rightful owner left to check against, anyone can delete it rather
        # than it being stuck undeletable via the API.
        if instance.created_by_id is not None and instance.created_by_id != self.request.user.id:
            raise PermissionDenied("Only the account that added this item can delete it.")
        instance.delete()

    @action(detail=False, methods=["post"], url_path="populate-from-trolley")
    def populate_from_trolley(self, request):
        """Create a new GroceryItem entirely from a trolley.co.uk product
        page — name, size, image, trolley_url, and a GroceryItemPrice for
        every store trolley.co.uk lists a price for that matches a known
        Store (others are reported back as unmatched_stores, same as
        refresh_price). Fails with a normal validation error if the page's
        name doesn't yield a usable size, same rule as adding one by hand.

        Open to any signed-in user — same trust level as refresh_price (a
        plain scrape of a public page, no third-party API, no bot-block
        risk).
        """
        request_serializer = PopulateFromTrolleyRequestSerializer(data=request.data)
        request_serializer.is_valid(raise_exception=True)
        trolley_url = request_serializer.validated_data["trolley_url"]

        product, error = _scrape_trolley_product(trolley_url)
        if error:
            body, error_status = error
            return Response(body, status=error_status)

        stores_by_normalized_name = {_normalize_store_name(s.name): s for s in Store.objects.all()}
        store_prices_data = []
        unmatched_stores = []
        for row_store, price, promo_price in product["store_prices"]:
            store = stores_by_normalized_name.get(_normalize_store_name(row_store))
            if store is None:
                unmatched_stores.append(row_store)
                continue
            store_prices_data.append(
                {"store": str(store.id), "price": price, "promo_price": promo_price, "product_url": ""}
            )

        serializer = GroceryItemSerializer(
            data={
                "name": product["name"],
                "brand": "",
                "aisle": "",
                "grams": product["grams"],
                "pieces": product["pieces"],
                "milliliters": product["milliliters"],
                "trolley_url": trolley_url,
                "image_url": product["image_url"],
                "store_prices": store_prices_data,
            },
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save(created_by=request.user)
        return Response(
            {**serializer.data, "unmatched_stores": unmatched_stores},
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["post"], url_path="refresh-price")
    def refresh_price(self, request, pk=None):
        """Re-fetch this item's prices from trolley.co.uk and save them.

        Accepts an optional `trolley_url` in the body so the form can refresh
        against a URL that's only just been typed in, without requiring a
        separate save first — when given, it's saved onto the item alongside
        the refreshed prices; otherwise the item's already-stored trolley_url
        is used.

        trolley.co.uk compares this product across every store it lists, so
        every row is used: each one that matches a known Store gets its
        GroceryItemPrice updated (or created, if this item wasn't priced at
        that store before) — existing prices for stores trolley.co.uk didn't
        mention this time are left untouched rather than cleared, since
        their absence from this particular page isn't evidence they're
        wrong. Rows that don't match any known Store are reported back but
        otherwise ignored.

        A store's promotional/loyalty-card price (e.g. Tesco Clubcard,
        Sainsbury's Nectar) is refreshed alongside its regular price — and,
        unlike the regular price, cleared to None if the store's row no
        longer shows one, since a promotion ending isn't evidence the old
        value is still valid.

        Open to any signed-in user — it's a plain GET of a URL, same as
        editing the item by hand.
        """
        item = self.get_object()
        serializer = RefreshPriceRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        trolley_url = serializer.validated_data.get("trolley_url") or item.trolley_url
        if not trolley_url:
            raise ValidationError({"trolley_url": ["This item has no trolley.co.uk URL set."]})

        rows, error = _scrape_trolley_prices(trolley_url)
        if error:
            body, error_status = error
            return Response(body, status=error_status)

        stores_by_normalized_name = {_normalize_store_name(s.name): s for s in Store.objects.all()}
        unmatched_stores = []
        for row_store, price, promo_price in rows:
            store = stores_by_normalized_name.get(_normalize_store_name(row_store))
            if store is None:
                unmatched_stores.append(row_store)
                continue
            GroceryItemPrice.objects.update_or_create(
                grocery_item=item, store=store, defaults={"price": price, "promo_price": promo_price}
            )

        item.trolley_url = trolley_url
        item.save(update_fields=["trolley_url", "updated_at"])
        data = GroceryItemSerializer(item, context={"request": request}).data
        return Response({**data, "unmatched_stores": unmatched_stores})
