from rest_framework import serializers

from .models import GroceryItem, Store, is_trolley_url


class StoreSerializer(serializers.ModelSerializer):
    class Meta:
        model = Store
        fields = ["id", "name"]


class GroceryItemSerializer(serializers.ModelSerializer):
    # A plain source="created_by.email" field would just be omitted from the
    # response for an item with no creator (created_by is nullable — the
    # creator's account can later be deleted), rather than serializing as
    # null: traversing ".email" on a None raises AttributeError, and DRF's
    # Field.get_attribute() turns that into SkipField for a non-required
    # field. A method field sidesteps that and always returns a value.
    created_by_email = serializers.SerializerMethodField()
    store_detail = StoreSerializer(source="store", read_only=True)

    class Meta:
        model = GroceryItem
        fields = [
            "id",
            "store",
            "store_detail",
            "name",
            "brand",
            "aisle",
            "grams",
            "pieces",
            "milliliters",
            "price",
            "product_url",
            "trolley_url",
            "image_url",
            "created_by_email",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["created_at", "updated_at"]

    def get_created_by_email(self, obj):
        return obj.created_by.email if obj.created_by else None

    def validate(self, attrs):
        def value(field):
            return attrs.get(field, getattr(self.instance, field, None) if self.instance else None)

        if value("grams") is None and value("pieces") is None and value("milliliters") is None:
            raise serializers.ValidationError("Provide grams, pieces, and/or milliliters.")
        return attrs

    def validate_trolley_url(self, value):
        if value and not is_trolley_url(value):
            raise serializers.ValidationError("Must be a trolley.co.uk product page URL.")
        return value


class RefreshPriceRequestSerializer(serializers.Serializer):
    # Optional: lets the caller refresh against a trolley_url that's only
    # sitting in an unsaved edit (see GroceryItemViewSet.refresh_price) —
    # falls back to the item's already-stored trolley_url when omitted.
    trolley_url = serializers.URLField(required=False, allow_blank=True)
