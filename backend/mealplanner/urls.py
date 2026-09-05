from rest_framework.routers import DefaultRouter

from .views import (
    EssentialsViewSet,
    MealPlanViewSet,
    MealSlotViewSet,
    RecipeViewSet,
    ShoppingListItemViewSet,
    ShoppingListViewSet,
)

router = DefaultRouter()
router.register("recipes", RecipeViewSet, basename="recipe")
router.register("essentials", EssentialsViewSet, basename="essentials")
router.register("meal-plans", MealPlanViewSet, basename="mealplan")
router.register("meal-slots", MealSlotViewSet, basename="mealslot")
router.register("shopping-lists", ShoppingListViewSet, basename="shoppinglist")
router.register("shopping-list-items", ShoppingListItemViewSet, basename="shoppinglistitem")

urlpatterns = router.urls
