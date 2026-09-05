import re

import requests
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import GroceryItem, Store, is_trolley_url
from .serializers import (
    GroceryItemSerializer,
    RefreshPriceRequestSerializer,
    StoreSerializer,
)

SCRAPE_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0 Safari/537.36"
)

# Bounds a trolley.co.uk page down to just its per-store comparison table —
# from its opening tag to the next top-level </section> (holds true across
# every product page checked; see _scrape_trolley_price for why this
# scoping matters).
COMPARISON_TABLE_RE = re.compile(r'class="comparison-table".*?</section>', re.DOTALL)

# One row of that table: a store's logo/title, then that store's price for
# this product. Prices are seen written both as a plain "£" character and
# as the "&pound;" HTML entity (observed to differ between pages), so both
# are matched; the price may or may not be wrapped in <b>.
STORE_ROW_RE = re.compile(
    r'<svg title="([^"]+)" class="store-logo[^"]*">.*?class="_price">\s*(?:<b>)?(?:&pound;|£)\s*([\d,]+\.\d{2})',
    re.DOTALL,
)


def _normalize_store_name(name):
    """Lowercase, alphanumeric-only comparison key so store names that
    differ only in punctuation/spacing still match, e.g. trolley.co.uk's
    "Sainsbury's" against this app's "Sainsburys", or "Co-op" against
    "Coop"."""
    return re.sub(r"[^a-z0-9]", "", name.lower())


def _scrape_trolley_price(trolley_url, store_name):
    """Fetch the current price for `store_name` from its trolley.co.uk page.

    trolley.co.uk price-compares one product across several supermarkets on
    a single page. Its schema.org Product/Offer JSON-LD block — which looked
    like the obvious thing to parse — only ever gives the single CHEAPEST
    price across every store listed, not the price at the specific store a
    GroceryItem is pinned to: confirmed by hand against
    https://www.trolley.co.uk/product/loyd-grossman-tikka-masala-sauce/XVR292,
    where the JSON-LD price (£2.84, Asda/Amazon) differs from Tesco's own row
    on that same page (£3.00). Using it here would risk silently overwriting
    an item's price with a different store's price entirely.

    So instead this walks the page's own per-store comparison table (each
    row: a store logo/title plus that store's price) and returns the one row
    matching `store_name`, ignoring the rest.

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

    # Scoped to just the comparison table, not the whole page — trolley.co.uk
    # also has "alternative products" widgets elsewhere on the page using the
    # same _price/store-logo markup for entirely different products, which
    # would otherwise be a second way to pick up the wrong price.
    table_match = COMPARISON_TABLE_RE.search(response.text)
    if not table_match:
        return None, (
            {"detail": "Could not find a price comparison table on that trolley.co.uk page."},
            status.HTTP_502_BAD_GATEWAY,
        )

    target = _normalize_store_name(store_name)
    for row_store, price in STORE_ROW_RE.findall(table_match.group(0)):
        if _normalize_store_name(row_store) == target:
            return price.replace(",", ""), None

    return None, (
        {"detail": f"trolley.co.uk doesn't list a {store_name} price for this product."},
        status.HTTP_404_NOT_FOUND,
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

        Open to any signed-in user — it's a plain GET of a URL, same as
        editing the item by hand.
        """
        item = self.get_object()
        serializer = RefreshPriceRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        trolley_url = serializer.validated_data.get("trolley_url") or item.trolley_url
        if not trolley_url:
            raise ValidationError({"trolley_url": ["This item has no trolley.co.uk URL set."]})

        price, error = _scrape_trolley_price(trolley_url, item.store.name)
        if error:
            body, error_status = error
            return Response(body, status=error_status)

        item.trolley_url = trolley_url
        item.price = price
        item.save(update_fields=["trolley_url", "price", "updated_at"])
        return Response(GroceryItemSerializer(item, context={"request": request}).data)
