from rest_framework import serializers

from .models import GroceryItem, Store


class StoreSerializer(serializers.ModelSerializer):
    class Meta:
        model = Store
        fields = ["id", "name"]


class GroceryItemSerializer(serializers.ModelSerializer):
    created_by_email = serializers.EmailField(source="created_by.email", read_only=True)
    store_detail = StoreSerializer(source="store", read_only=True)

    class Meta:
        model = GroceryItem
        fields = [
            "id",
            "store",
            "store_detail",
            "name",
            "brand",
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
