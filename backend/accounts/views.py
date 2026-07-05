from allauth.socialaccount.providers.google.views import GoogleOAuth2Adapter
from dj_rest_auth.registration.views import SocialLoginView


class GoogleLogin(SocialLoginView):
    """Exchanges a Google access token (obtained by the SPA) for a session/JWT."""

    adapter_class = GoogleOAuth2Adapter
