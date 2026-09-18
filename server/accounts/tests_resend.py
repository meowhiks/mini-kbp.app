from unittest.mock import MagicMock, patch

from django.core.mail import EmailMultiAlternatives, send_mail
from django.test import SimpleTestCase, override_settings

from accounts.resend_backend import ResendEmailBackend


@override_settings(
    EMAIL_BACKEND="accounts.resend_backend.ResendEmailBackend",
    RESEND_API_KEY="re_test_key",
    DEFAULT_FROM_EMAIL="MiniKBP <onboarding@resend.dev>",
)
class ResendEmailBackendTests(SimpleTestCase):
    @patch("accounts.resend_backend.requests.post")
    def test_send_mail_posts_to_resend(self, mock_post):
        mock_post.return_value = MagicMock(status_code=200, text="{}")
        sent = send_mail(
            "Hello World",
            "plain",
            None,
            ["meowhiks@gmail.com"],
            html_message="<p>Congrats</p>",
        )
        self.assertEqual(sent, 1)
        mock_post.assert_called_once()
        args, kwargs = mock_post.call_args
        self.assertEqual(args[0], "https://api.resend.com/emails")
        self.assertEqual(kwargs["headers"]["Authorization"], "Bearer re_test_key")
        payload = kwargs["json"]
        self.assertEqual(payload["to"], ["meowhiks@gmail.com"])
        self.assertEqual(payload["subject"], "Hello World")
        self.assertEqual(payload["html"], "<p>Congrats</p>")
        self.assertIn("onboarding@resend.dev", payload["from"])

    @patch("accounts.resend_backend.requests.post")
    def test_http_error_raises(self, mock_post):
        mock_post.return_value = MagicMock(status_code=403, text='{"message":"forbidden"}')
        backend = ResendEmailBackend(fail_silently=False)
        msg = EmailMultiAlternatives("s", "t", "from@test.dev", ["a@b.c"])
        with self.assertRaises(RuntimeError):
            backend.send_messages([msg])

    def test_missing_key_raises(self):
        with override_settings(RESEND_API_KEY=""):
            backend = ResendEmailBackend(fail_silently=False)
            msg = EmailMultiAlternatives("s", "t", "from@test.dev", ["a@b.c"])
            with self.assertRaises(RuntimeError):
                backend.send_messages([msg])
