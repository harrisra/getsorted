from rest_framework.routers import DefaultRouter

from .views import GroceryItemViewSet

router = DefaultRouter()
router.register("grocery-items", GroceryItemViewSet, basename="groceryitem")

urlpatterns = router.urls
