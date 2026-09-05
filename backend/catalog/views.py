import json
import re
from urllib.parse import urlparse

import requests
from django.conf import settings
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import GroceryItem, Store, is_trolley_url
from .serializers import (
    GroceryItemSerializer,
    PopulateRequestSerializer,
    RefreshPriceRequestSerializer,
    ScrapeRequestSerializer,
    StoreSerializer,
)

PEPESTO_PRODUCTS_URL = "https://s.pepesto.com/api/products"
SAINSBURYS_SEARCH_URL = "https://www.sainsburys.co.uk/groceries-api/gol-services/product/v1/product"
SCRAPE_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0 Safari/537.36"
)

# A single /scrape/ request looks each URL up synchronously (no background
# job queue in this stack) — cap how many can be pasted in at once so one
# request can't hang for minutes or trip a gateway timeout.
MAX_SCRAPE_URLS = 25

# /populate/ and /scrape/ both hit external services (Pepesto's paid API,
# Sainsbury's own site) on the caller's behalf — restricted to one account
# rather than opened up to every signed-in user of the app.
SCRAPE_ALLOWED_EMAIL = "rob.harris@harristribe.co.uk"

SIZE_RE = re.compile(
    r"(\d+(?:\.\d+)?)\s*(kg|g|litres?|l|ml)\b|(\d+)\s*(?:x|pack|pieces?|pcs?)\b", re.IGNORECASE
)

JSON_LD_RE = re.compile(
    r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
    re.IGNORECASE | re.DOTALL,
)


def _parse_size(text):
    """Best-effort grams/pieces/milliliters from a free-text size string
    such as '350g', '1.5kg', '500ml', '6 pack' — used against scraped
    product data whose exact format isn't guaranteed. Returns
    (grams, pieces, milliliters), each None if nothing matched."""
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


def _dig(obj, *path):
    """Best-effort nested lookup — obj[path[0]][path[1]]..., supporting
    both dict keys and list indices. Returns None on any missing key/
    index/type mismatch rather than raising, since scraped JSON shapes
    aren't guaranteed to match what's expected."""
    for key in path:
        try:
            obj = obj[key]
        except (KeyError, IndexError, TypeError):
            return None
    return obj


def _guess_name_from_url(url):
    """A rough product name guessed from the URL's last path segment, e.g.
    ".../loyd-grossman-tikka-masala-curry-cooking-sauce-350g" becomes
    "loyd grossman tikka masala curry cooking sauce 350g" — fed to Pepesto
    as the descriptive text it needs to match against, standing in for a
    name nobody typed (see GroceryItemViewSet.scrape)."""
    slug = urlparse(url).path.rstrip("/").rsplit("/", 1)[-1]
    guess = re.sub(r"[-_]+", " ", slug).strip()
    return guess or url


def _pepesto_lookup(name, product_url):
    """Best-effort lookup of store/name/size/price via the Pepesto product
    API, shared by /populate/ (one URL, user reviews before saving) and
    /scrape/ (many URLs, saved straight away).

    Pepesto matches on descriptive text against a limited cached catalog
    per supermarket, not a direct URL lookup — the product URL is only a
    soft hint, so the result may not be the exact product at that URL
    (see matched_exact in the returned data).

    Returns (data, error): exactly one is None. `data["store"]` is a Store
    instance or None (the guessed store name didn't match the known list —
    left for the caller to decide what to do, since /populate/ and
    /scrape/ handle that differently). `error` is a (response_body,
    http_status) pair ready to hand straight to Response(*error).
    """
    domain = (urlparse(product_url).hostname or "").removeprefix("www.")
    if not domain:
        return None, (
            {"product_url": ["Could not determine the store from this URL."]},
            status.HTTP_400_BAD_REQUEST,
        )

    try:
        response = requests.post(
            PEPESTO_PRODUCTS_URL,
            json={
                "manual_shopping_list": name,
                "supermarket_domain": domain,
                "preferred_product_urls": [product_url],
            },
            headers={"Authorization": f"Bearer {settings.PEPESTO_API_KEY}"},
            timeout=15,
        )
        response.raise_for_status()
        data = response.json()
    except requests.RequestException:
        return None, (
            {"detail": "Could not reach the product lookup service. Try again later."},
            status.HTTP_502_BAD_GATEWAY,
        )

    products = (data.get("items") or [{}])[0].get("products") or []
    if not products:
        return None, (
            {"detail": "No matching product found. Try filling in the details manually."},
            status.HTTP_404_NOT_FOUND,
        )

    exact_match = next(
        (p for p in products if p.get("product", {}).get("product_id") == product_url),
        None,
    )
    best = exact_match or products[0]
    product = best.get("product", {})

    grams = product.get("quantity", {}).get("grams")
    price_pence = product.get("price", {}).get("price")

    # Just the domain's leading word (e.g. "sainsburys" from
    # sainsburys.co.uk) — a best-effort guess, so it often won't match
    # the curated Store list exactly (missing apostrophe, "M&S Food"
    # vs. "marksandspencer", etc.). Match what we can; leave the rest
    # for the caller to handle.
    guessed_store_name = domain.split(".")[0].capitalize()
    matched_store = Store.objects.filter(name__iexact=guessed_store_name).first()

    return {
        "store": matched_store,
        "store_name": guessed_store_name,
        "name": product.get("product_name") or name,
        "grams": grams,
        "pieces": None,
        "milliliters": None,
        "price": f"{price_pence / 100:.2f}" if price_pence is not None else None,
        "product_url": product.get("product_id") or product_url,
        "image_url": product.get("pepesto_hosted_image_url") or product.get("image_url") or "",
        "matched_exact": exact_match is not None,
    }, None


def _is_sainsburys_url(url):
    hostname = (urlparse(url).hostname or "").removeprefix("www.")
    return hostname == "sainsburys.co.uk"


def _scrape_sainsburys(url):
    """Look up a Sainsbury's product directly via their own product search
    API, rather than through Pepesto — no third-party lookup needed for
    this store. Searches by a name guessed from the URL's slug (there's no
    working direct-by-URL lookup we've found), takes the top result, and
    parses out whatever fields are present.

    NOTE: this server's outbound IP got a flat "Access Denied" (Akamai edge
    block) from sainsburys.co.uk in testing, for both the product pages and
    this API, regardless of headers — likely a datacenter-IP block rather
    than anything fixable by request-crafting. This may work fine from a
    different network (e.g. residential IP) even though it couldn't be
    verified live from here. The field names below (name/price/size/image)
    are a best guess at the response shape, since a real successful
    response was never seen to confirm against — if they turn out wrong,
    every result will fail with "could not parse", which is the signal to
    come back and fix the field paths in _dig(...) below.

    Returns (data, error) in the same shape as _pepesto_lookup.
    """
    keyword = _guess_name_from_url(url)
    if not keyword:
        return None, (
            {"detail": "Could not determine a product name from this URL."},
            status.HTTP_400_BAD_REQUEST,
        )

    try:
        response = requests.get(
            SAINSBURYS_SEARCH_URL,
            params={"filter[keyword]": keyword, "page_number": 1, "page_size": 24},
            headers={"Accept": "application/json"},
            timeout=15,
        )
    except requests.RequestException:
        return None, (
            {"detail": "Could not reach Sainsbury's product search. Try again later."},
            status.HTTP_502_BAD_GATEWAY,
        )

    # Distinguished from a connection failure: this means the request did
    # reach Sainsbury's, but their edge/bot protection rejected it outright
    # (seen consistently in testing regardless of headers used — possibly
    # specific to this server's outbound IP, so this may not reproduce from
    # elsewhere) rather than the service being unreachable.
    if response.status_code in (401, 403):
        return None, (
            {"detail": "Sainsbury's blocked this request (access denied). Add the item manually instead."},
            status.HTTP_502_BAD_GATEWAY,
        )

    try:
        response.raise_for_status()
        payload = response.json()
    except requests.RequestException:
        return None, (
            {"detail": "Could not reach Sainsbury's product search. Try again later."},
            status.HTTP_502_BAD_GATEWAY,
        )
    except ValueError:
        return None, (
            {"detail": "Sainsbury's product search returned an unexpected response."},
            status.HTTP_502_BAD_GATEWAY,
        )

    products = _dig(payload, "products") or _dig(payload, "data", "products") or []
    if not products:
        return None, ({"detail": "No matching product found on Sainsbury's."}, status.HTTP_404_NOT_FOUND)

    product = products[0]

    name = _dig(product, "name") or _dig(product, "product_name") or _dig(product, "title") or keyword.title()

    price = (
        _dig(product, "retail_price", "price")
        or _dig(product, "price", "now")
        or _dig(product, "unit_price", "price")
        or _dig(product, "price")
    )
    price = f"{float(price):.2f}" if isinstance(price, (int, float)) else None

    size_text = (
        _dig(product, "unit_qty") or _dig(product, "weight_display") or _dig(product, "pack_size") or ""
    )
    grams, pieces, milliliters = _parse_size(str(size_text))
    if grams is None and pieces is None and milliliters is None:
        grams, pieces, milliliters = _parse_size(name)

    image_url = (
        _dig(product, "image_url")
        or _dig(product, "images", 0, "url")
        or _dig(product, "product_image", "default", "url")
        or _dig(product, "media", "images", 0, "default", "url")
        or ""
    )

    sainsburys = Store.objects.filter(name__iexact="Sainsburys").first()

    return {
        "store": sainsburys,
        "store_name": "Sainsburys",
        "name": name,
        "grams": grams,
        "pieces": pieces,
        "milliliters": milliliters,
        "price": price,
        # The URL the caller gave us, not something read back out of the
        # search result — this is a keyword search, not a lookup by that
        # exact URL, so there's no more authoritative product_url to use.
        "product_url": url,
        "image_url": image_url,
        # Never "exact" — this is a best-effort name search, not a direct
        # lookup of the product at this specific URL.
        "matched_exact": False,
    }, None


def _scrape_trolley_price(trolley_url):
    """Fetch the current price shown on a trolley.co.uk product page.

    Unlike the Pepesto/Sainsbury's lookups above, this isn't a name-based
    search — trolley.co.uk price-compares a specific product across
    supermarkets and renders the cheapest current price server-side into a
    schema.org Product/Offer JSON-LD block on every page load (confirmed by
    hand against https://www.trolley.co.uk/product/tesco-semi-skimmed-milk/MAC224
    — the price is plain text already in the HTML response, not filled in by
    a separate client-side API call), so a plain GET plus parsing that block
    is enough.

    Returns (price, error): exactly one is None. `price` is a decimal
    string, e.g. "0.85". `error` is a (response_body, http_status) pair
    ready to hand straight to Response(*error).
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

    for block in JSON_LD_RE.findall(response.text):
        try:
            data = json.loads(block)
        except ValueError:
            continue
        if data.get("@type") != "Product":
            continue
        price = _dig(data, "offers", "price")
        if price is None:
            continue
        try:
            return f"{float(price):.2f}", None
        except (TypeError, ValueError):
            continue

    return None, (
        {"detail": "Could not find a price on that trolley.co.uk page."},
        status.HTTP_502_BAD_GATEWAY,
    )


def _flatten_errors(errors):
    return "; ".join(
        f"{field}: {', '.join(str(m) for m in messages)}" for field, messages in errors.items()
    )


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

    @action(detail=True, methods=["post"], url_path="refresh-price")
    def refresh_price(self, request, pk=None):
        """Re-fetch this item's price from trolley.co.uk and save it.

        Accepts an optional `trolley_url` in the body so the form can refresh
        against a URL that's only just been typed in, without requiring a
        separate save first — when given, it's saved onto the item alongside
        the refreshed price; otherwise the item's already-stored trolley_url
        is used.

        Unlike /populate/ and /scrape/, this doesn't call a third-party
        lookup service on the app's behalf (no Pepesto cost, no bot-block
        risk) — it's a plain GET of a URL, so it's open to any signed-in
        user, same as editing the item by hand.
        """
        item = self.get_object()
        serializer = RefreshPriceRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        trolley_url = serializer.validated_data.get("trolley_url") or item.trolley_url
        if not trolley_url:
            raise ValidationError({"trolley_url": ["This item has no trolley.co.uk URL set."]})

        price, error = _scrape_trolley_price(trolley_url)
        if error:
            body, error_status = error
            return Response(body, status=error_status)

        item.trolley_url = trolley_url
        item.price = price
        item.save(update_fields=["trolley_url", "price", "updated_at"])
        return Response(GroceryItemSerializer(item, context={"request": request}).data)

    @action(detail=False, methods=["post"], url_path="populate")
    def populate(self, request):
        """Best-effort lookup of store/name/size/price via the Pepesto product API.

        Pepesto matches on descriptive text against a limited cached catalog per
        supermarket, not a direct URL lookup — the pasted product URL is only a
        soft hint, so the result may not be the exact product at that URL. The
        response tells the caller whether the match was exact. Returns a preview
        for the caller to review/edit before saving — see scrape() for saving
        straight away from a list of URLs instead.
        """
        if request.user.email != SCRAPE_ALLOWED_EMAIL:
            raise PermissionDenied("Not available on this account.")

        if not settings.PEPESTO_API_KEY:
            return Response(
                {"detail": "Pepesto API key not configured on the server."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        serializer = PopulateRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        name = serializer.validated_data["name"]
        product_url = serializer.validated_data["product_url"]

        data, error = _pepesto_lookup(name, product_url)
        if error:
            body, error_status = error
            return Response(body, status=error_status)

        return Response({**data, "store": str(data["store"].id) if data["store"] else None})

    @action(detail=False, methods=["post"], url_path="scrape")
    def scrape(self, request):
        """Bulk-create grocery items from a plain-text list of product URLs
        (one per line), via the same Pepesto lookup /populate/ uses — but
        run per URL and saved straight away rather than returned for
        review, since pasting in a whole list implies "add all of these",
        not "let me check each one first". A rough name guessed from each
        URL's slug stands in for the name /populate/ normally needs, since
        there's no per-URL name to type here.

        Never fails the whole batch for one bad URL — each line succeeds or
        fails independently, and the per-URL results (created item or a
        reason it wasn't) are all returned together.
        """
        if request.user.email != SCRAPE_ALLOWED_EMAIL:
            raise PermissionDenied("Not available on this account.")

        if not settings.PEPESTO_API_KEY:
            return Response(
                {"detail": "Pepesto API key not configured on the server."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        serializer = ScrapeRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        urls = [line.strip() for line in serializer.validated_data["urls"].splitlines() if line.strip()]
        if not urls:
            raise ValidationError({"urls": ["Provide at least one URL."]})
        if len(urls) > MAX_SCRAPE_URLS:
            raise ValidationError({"urls": [f"Provide at most {MAX_SCRAPE_URLS} URLs at a time."]})

        results = []
        for url in urls:
            parsed = urlparse(url)
            if parsed.scheme not in ("http", "https") or not parsed.hostname:
                results.append({"url": url, "status": "error", "detail": "Not a valid URL."})
                continue

            if _is_sainsburys_url(url):
                data, error = _scrape_sainsburys(url)
            else:
                data, error = _pepesto_lookup(_guess_name_from_url(url), url)
            if error:
                body, _error_status = error
                results.append(
                    {"url": url, "status": "error", "detail": body.get("detail") or _flatten_errors(body)}
                )
                continue

            if data["store"] is None:
                results.append(
                    {
                        "url": url,
                        "status": "error",
                        "detail": f'Could not match "{data["store_name"]}" to a store in the list.',
                    }
                )
                continue

            item_serializer = GroceryItemSerializer(
                data={
                    "store": str(data["store"].id),
                    "name": data["name"],
                    "brand": "",
                    "aisle": "",
                    "grams": data["grams"],
                    "pieces": data["pieces"],
                    "milliliters": data["milliliters"],
                    "price": data["price"],
                    "product_url": data["product_url"],
                    "image_url": data["image_url"],
                },
                context={"request": request},
            )
            if not item_serializer.is_valid():
                results.append(
                    {"url": url, "status": "error", "detail": _flatten_errors(item_serializer.errors)}
                )
                continue

            item_serializer.save(created_by=request.user)
            results.append(
                {
                    "url": url,
                    "status": "created",
                    "item": item_serializer.data,
                    "matched_exact": data["matched_exact"],
                }
            )

        return Response({"results": results})
