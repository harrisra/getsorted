import uuid

from django.conf import settings
from django.db import models


class GroceryItem(models.Model):
    """A store-bought product in the shared, app-wide grocery catalog.

    Unlike other domain data this isn't scoped to a Household — it's a single
    catalog every household can browse and contribute to, e.g. so the same
    "Tesco British Cooked Ham Slices 120g" entry can be reused by anyone.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    store = models.CharField(max_length=255)
    name = models.CharField(max_length=255)
    brand = models.CharField(max_length=255, blank=True)
    size = models.CharField(max_length=100, blank=True, help_text="e.g. 120g")
    price = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    product_url = models.URLField(blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["store", "name"]

    def __str__(self):
        return f"{self.store} — {self.name}"
