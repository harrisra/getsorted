from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path

from accounts.views import GoogleLogin


def health(request):
    return JsonResponse({"status": "ok"})


urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/health/", health, name="health"),
    # Email/password auth (login, logout, password reset, current user).
    # dj_rest_auth.urls itself registers `token/refresh/` (cookie-aware,
    # reads getsorted-refresh-token) when settings.REST_AUTH["USE_JWT"] is
    # True — do not add a second one here, it would just shadow this and
    # expect the refresh token in the body, which JS can't read anyway
    # since it's an httpOnly cookie.
    path("api/auth/", include("dj_rest_auth.urls")),
    path("api/auth/registration/", include("dj_rest_auth.registration.urls")),
    path("api/auth/google/", GoogleLogin.as_view(), name="google_login"),
    path("api/accounts/", include("accounts.urls")),
    # Sub-apps
    path("api/mealplanner/", include("mealplanner.urls")),
    path("api/catalog/", include("catalog.urls")),
]
