import re
from urllib.parse import urlparse

import requests
from django.conf import settings
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import GroceryItem, Store
from .serializers import (
    GroceryItemSerializer,
    PopulateRequestSerializer,
    ScrapeRequestSerializer,
    StoreSerializer,
)

PEPESTO_PRODUCTS_URL = "https://s.pepesto.com/api/products"

# A single /scrape/ request looks each URL up synchronously (no background
# job queue in this stack) — cap how many can be pasted in at once so one
# request can't hang for minutes or trip a gateway timeout.
MAX_SCRAPE_URLS = 25


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
