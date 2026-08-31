from rest_framework.routers import DefaultRouter

from .views import GroceryItemViewSet, StoreViewSet

router = DefaultRouter()
router.register("grocery-items", GroceryItemViewSet, basename="groceryitem")
router.register("stores", StoreViewSet, basename="store")

urlpatterns = router.urls
