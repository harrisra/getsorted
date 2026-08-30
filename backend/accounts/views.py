from allauth.socialaccount.providers.google.views import GoogleOAuth2Adapter
from dj_rest_auth.registration.views import SocialLoginView
from rest_framework import mixins, viewsets
from rest_framework.permissions import IsAuthenticated

from .models import Household
from .serializers import HouseholdSerializer


class GoogleLogin(SocialLoginView):
    """Exchanges a Google access token (obtained by the SPA) for a session/JWT."""

    adapter_class = GoogleOAuth2Adapter


class HouseholdViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    """List/create households for the current user; creator becomes its admin."""

    serializer_class = HouseholdSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Household.objects.filter(members=self.request.user).order_by("name")
