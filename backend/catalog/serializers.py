from rest_framework import serializers

from .models import GroceryItem, GroceryItemPrice, Store, is_trolley_url


class StoreSerializer(serializers.ModelSerializer):
    class Meta:
        model = Store
        fields = ["id", "name"]


class GroceryItemPriceSerializer(serializers.ModelSerializer):
    store_detail = StoreSerializer(source="store", read_only=True)

    class Meta:
        model = GroceryItemPrice
        fields = ["id", "store", "store_detail", "price", "promo_price", "product_url", "updated_at"]
        read_only_fields = ["updated_at"]


class GroceryItemSerializer(serializers.ModelSerializer):
    # A plain source="created_by.email" field would just be omitted from the
    # response for an item with no creator (created_by is nullable — the
    # creator's account can later be deleted), rather than serializing as
    # null: traversing ".email" on a None raises AttributeError, and DRF's
    # Field.get_attribute() turns that into SkipField for a non-required
    # field. A method field sidesteps that and always returns a value.
    created_by_email = serializers.SerializerMethodField()
    # Written as raw dicts by create()/update() below rather than through
    # this nested serializer's own create/update, same pattern as
    # mealplanner.RecipeSerializer's ingredients.
    store_prices = GroceryItemPriceSerializer(many=True, required=False)

    class Meta:
        model = GroceryItem
        fields = [
            "id",
            "name",
            "brand",
            "aisle",
            "grams",
            "pieces",
            "milliliters",
            "trolley_url",
            "image_url",
            "store_prices",
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
            if self.instance is None:
                # A brand-new item with no size specified at all — default
                # to a single whole item/pack rather than forcing every add
                # to specify one (many products, e.g. a jar or a tin, are
                # naturally "1 of something" rather than a weight/volume).
                # Editing an existing item still requires clearing down to
                # at least one explicitly — this default is only for new
                # items where nothing was given to begin with.
                attrs["pieces"] = 1
            else:
                raise serializers.ValidationError("Provide grams, pieces, and/or milliliters.")

        store_prices = attrs.get("store_prices")
        if store_prices:
            store_ids = [sp["store"].id for sp in store_prices]
            if len(store_ids) != len(set(store_ids)):
                raise serializers.ValidationError(
                    {"store_prices": "Only one price is allowed per store."}
                )
        return attrs

    def validate_trolley_url(self, value):
        if value and not is_trolley_url(value):
            raise serializers.ValidationError("Must be a trolley.co.uk product page URL.")
        return value

    def create(self, validated_data):
        store_prices_data = validated_data.pop("store_prices", [])
        item = super().create(validated_data)
        self._sync_store_prices(item, store_prices_data)
        return item

    def update(self, instance, validated_data):
        store_prices_data = validated_data.pop("store_prices", None)
        item = super().update(instance, validated_data)
        if store_prices_data is not None:
            self._sync_store_prices(item, store_prices_data)
        return item

    def _sync_store_prices(self, item, store_prices_data):
        """Update existing rows in place and add/remove as needed, rather
        than always deleting and recreating every row on every save — a
        ShoppingListItem references a GroceryItemPrice by id, so recreating
        them on every edit would silently break every such match each time
        this item's form is saved.
        """
        existing_by_store = {price.store_id: price for price in item.store_prices.all()}
        seen_store_ids = set()
        for data in store_prices_data:
            store = data["store"]
            seen_store_ids.add(store.id)
            existing = existing_by_store.get(store.id)
            if existing:
                existing.price = data.get("price")
                existing.promo_price = data.get("promo_price")
                existing.product_url = data.get("product_url", "")
                existing.save(update_fields=["price", "promo_price", "product_url", "updated_at"])
            else:
                GroceryItemPrice.objects.create(
                    grocery_item=item,
                    store=store,
                    price=data.get("price"),
                    promo_price=data.get("promo_price"),
                    product_url=data.get("product_url", ""),
                )
        for store_id, existing in existing_by_store.items():
            if store_id not in seen_store_ids:
                existing.delete()


class RefreshPriceRequestSerializer(serializers.Serializer):
    # Optional: lets the caller refresh against a trolley_url that's only
    # sitting in an unsaved edit (see GroceryItemViewSet.refresh_price) —
    # falls back to the item's already-stored trolley_url when omitted.
    trolley_url = serializers.URLField(required=False, allow_blank=True)


class PopulateFromTrolleyRequestSerializer(serializers.Serializer):
    trolley_url = serializers.URLField()
