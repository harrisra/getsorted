from rest_framework import serializers

from .models import GroceryItem


class GroceryItemSerializer(serializers.ModelSerializer):
    created_by_email = serializers.EmailField(source="created_by.email", read_only=True)

    class Meta:
        model = GroceryItem
        fields = [
            "id",
            "store",
            "name",
            "brand",
            "size",
            "price",
            "product_url",
            "image_url",
            "created_by_email",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["created_at", "updated_at"]


class PopulateRequestSerializer(serializers.Serializer):
    name = serializers.CharField(
        help_text="A rough product description, e.g. 'Tesco British Cooked Ham Slices 120g'."
    )
    product_url = serializers.URLField()
