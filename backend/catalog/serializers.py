from rest_framework import serializers

from .models import GroceryItem, Store


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


class PopulateRequestSerializer(serializers.Serializer):
    name = serializers.CharField(
        help_text="A rough product description, e.g. 'Tesco British Cooked Ham Slices 120g'."
    )
    product_url = serializers.URLField()


class ScrapeRequestSerializer(serializers.Serializer):
    urls = serializers.CharField(help_text="One product URL per line.")
