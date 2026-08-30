from rest_framework import serializers

from .models import Household, Membership


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
