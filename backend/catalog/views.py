from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

from .models import GroceryItem
from .serializers import GroceryItemSerializer


class GroceryItemViewSet(viewsets.ModelViewSet):
    """Shared, app-wide grocery catalog. Any signed-in user can manage entries."""

    queryset = GroceryItem.objects.all()
    serializer_class = GroceryItemSerializer
    permission_classes = [IsAuthenticated]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)
