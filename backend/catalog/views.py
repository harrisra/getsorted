from urllib.parse import urlparse

import requests
from django.conf import settings
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import GroceryItem, Store
from .serializers import GroceryItemSerializer, PopulateRequestSerializer, StoreSerializer

PEPESTO_PRODUCTS_URL = "https://s.pepesto.com/api/products"


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
        response tells the caller whether the match was exact.
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

        domain = (urlparse(product_url).hostname or "").removeprefix("www.")
        if not domain:
            return Response(
                {"product_url": ["Could not determine the store from this URL."]},
                status=status.HTTP_400_BAD_REQUEST,
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
            return Response(
                {"detail": "Could not reach the product lookup service. Try again later."},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        products = (data.get("items") or [{}])[0].get("products") or []
        if not products:
            return Response(
                {"detail": "No matching product found. Try filling in the details manually."},
                status=status.HTTP_404_NOT_FOUND,
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
        # for the user to pick from the dropdown themselves.
        guessed_store_name = domain.split(".")[0].capitalize()
        matched_store = Store.objects.filter(name__iexact=guessed_store_name).first()

        return Response(
            {
                "store": str(matched_store.id) if matched_store else None,
                "store_name": guessed_store_name,
                "name": product.get("product_name") or name,
                "grams": grams,
                "pieces": None,
                "milliliters": None,
                "price": f"{price_pence / 100:.2f}" if price_pence is not None else None,
                "product_url": product.get("product_id") or product_url,
                "image_url": product.get("pepesto_hosted_image_url") or product.get("image_url") or "",
                "matched_exact": exact_match is not None,
            }
        )
