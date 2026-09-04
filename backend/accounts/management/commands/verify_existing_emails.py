from allauth.account.models import EmailAddress
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

User = get_user_model()


class Command(BaseCommand):
    """Marks every existing user's primary email as verified in allauth.

    Needed once, per environment, before enabling
    SOCIALACCOUNT_EMAIL_AUTHENTICATION_AUTO_CONNECT: allauth wipes a local
    password when connecting a Google login to an account whose matching
    email isn't already verified (an anti-account-takeover safeguard). These
    accounts were created via email/password signup (or `createsuperuser`,
    which leaves no allauth EmailAddress record at all) before Google login
    existed, so none of them are marked verified yet — running this once
    lets a household member's first Google sign-in link to their existing
    account without silently locking them out of password login.

    Safe to re-run: does nothing for a user who already has a verified
    EmailAddress.
    """

    help = "Mark every existing user's email as verified (see docstring)."

    def handle(self, *args, **options):
        updated = 0
        for user in User.objects.all():
            address, created = EmailAddress.objects.get_or_create(
                user=user,
                email=user.email,
                defaults={"verified": True, "primary": True},
            )
            if not created and not address.verified:
                address.verified = True
                address.primary = True
                address.save(update_fields=["verified", "primary"])
                updated += 1
            elif created:
                updated += 1
        self.stdout.write(self.style.SUCCESS(f"Verified email for {updated} user(s)."))
