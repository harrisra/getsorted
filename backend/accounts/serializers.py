from rest_framework import serializers

from .models import Household, Membership, User


class HouseholdSerializer(serializers.ModelSerializer):
    role = serializers.SerializerMethodField()

    class Meta:
        model = Household
        fields = ["id", "name", "created_at", "role"]
        read_only_fields = ["created_at", "role"]

    def get_role(self, obj: Household) -> str | None:
        membership = Membership.objects.filter(
            household=obj, user=self.context["request"].user
        ).first()
        return membership.role if membership else None

    def create(self, validated_data):
        household = super().create(validated_data)
        Membership.objects.create(
            user=self.context["request"].user,
            household=household,
            role=Membership.Role.ADMIN,
        )
        return household


class MembershipSerializer(serializers.ModelSerializer):
    user_id = serializers.UUIDField(source="user.id", read_only=True)
    email = serializers.EmailField(source="user.email", read_only=True)

    class Meta:
        model = Membership
        fields = ["user_id", "email", "role", "joined_at"]


class AddMemberSerializer(serializers.Serializer):
    email = serializers.EmailField()

    def validate_email(self, email: str) -> str:
        if not User.objects.filter(email__iexact=email).exists():
            raise serializers.ValidationError(
                "No account with that email address. They need to sign up first."
            )
        return email
