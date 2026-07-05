from rest_framework.routers import DefaultRouter

from .views import MealPlanViewSet, MealSlotViewSet, RecipeViewSet, ShoppingListItemViewSet

router = DefaultRouter()
router.register("recipes", RecipeViewSet, basename="recipe")
router.register("meal-plans", MealPlanViewSet, basename="mealplan")
router.register("meal-slots", MealSlotViewSet, basename="mealslot")
router.register("shopping-list-items", ShoppingListItemViewSet, basename="shoppinglistitem")

urlpatterns = router.urls
