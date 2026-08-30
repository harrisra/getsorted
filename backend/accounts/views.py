from allauth.socialaccount.providers.google.views import GoogleOAuth2Adapter
from dj_rest_auth.registration.views import SocialLoginView
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.generics import get_object_or_404
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Household, Membership, User
from .serializers import AddMemberSerializer, HouseholdSerializer, MembershipSerializer


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

    def _require_admin(self, household: Household) -> None:
        is_admin = Membership.objects.filter(
            household=household, user=self.request.user, role=Membership.Role.ADMIN
        ).exists()
        if not is_admin:
            raise PermissionDenied("Only a household admin can do this.")

    @action(detail=True, methods=["get", "post"], url_path="members")
    def members(self, request, pk=None):
        household = self.get_object()

        if request.method == "POST":
            self._require_admin(household)
            serializer = AddMemberSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            user = User.objects.get(email__iexact=serializer.validated_data["email"])
            if Membership.objects.filter(household=household, user=user).exists():
                raise ValidationError({"email": ["This person is already a member."]})
            membership = Membership.objects.create(
                household=household, user=user, role=Membership.Role.MEMBER
            )
            return Response(
                MembershipSerializer(membership).data, status=status.HTTP_201_CREATED
            )

        memberships = (
            Membership.objects.filter(household=household)
            .select_related("user")
            .order_by("role", "user__email")
        )
        return Response(MembershipSerializer(memberships, many=True).data)

    @action(
        detail=True,
        methods=["delete"],
        url_path=r"members/(?P<member_id>[^/.]+)",
    )
    def remove_member(self, request, pk=None, member_id=None):
        household = self.get_object()
        self._require_admin(household)
        membership = get_object_or_404(Membership, household=household, user_id=member_id)

        is_last_admin = (
            membership.role == Membership.Role.ADMIN
            and Membership.objects.filter(
                household=household, role=Membership.Role.ADMIN
            ).count()
            <= 1
        )
        if is_last_admin:
            raise ValidationError({"detail": "A household must keep at least one admin."})

        membership.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
