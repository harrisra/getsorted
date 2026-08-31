from dj_rest_auth.jwt_auth import JWTCookieAuthentication as _JWTCookieAuthentication
from rest_framework.exceptions import AuthenticationFailed


class JWTCookieAuthentication(_JWTCookieAuthentication):
    """dj_rest_auth's cookie JWT authenticator, but a stale/unusable token —
    expired, malformed, or naming a user that no longer exists or is
    inactive — is treated as "no credentials" (return None) rather than
    aborting the request.

    DRF resolves every configured authenticator up front, before a view's
    permission_classes is even consulted (APIView.initial() touches
    request.user unconditionally). Without this, a leftover browser cookie
    from before an account was deleted/recreated — or simply one that's
    expired — would 401 an AllowAny endpoint like login, registration, or
    password reset before the view code, and the credentials actually
    submitted, are ever looked at. Endpoints that truly require a logged-in
    user are unaffected: they still 401 normally via the ordinary "no
    authenticator succeeded" path once request.user falls back to
    AnonymousUser.
    """

    def authenticate(self, request):
        try:
            return super().authenticate(request)
        except AuthenticationFailed:
            return None
