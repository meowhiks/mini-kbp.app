from django.contrib import admin
from django.urls import path, include
from rest_framework.routers import DefaultRouter

from accounts.views import (
    TeacherViewSet,
    StudentViewSet,
    TeacherLoginView,
    AdminLoginView,
)
from accounts.student_views import (
    PublicGroupListView,
    StudentLoginView,
    StudentJournalView,
    StudentLatenessView,
)
from accounts.app_auth_views import (
    AppRegisterView,
    AppLoginView,
    AppTelegramLoginView,
    AppTelegramLinkStartView,
    AppTelegramLinkPollView,
    AppGoogleLoginView,
    AppMobileAuthExchangeView,
    AppMobileWebLinkStartView,
    AppMobileWebLinkPollView,
    AppMobileWebLinkCompleteView,
    PublicAppConfigView,
    AppVerifyView,
    AppVerifyEmailView,
    AppTwoFaLoginView,
    AppPasswordResetRequestView,
    AppPasswordResetConfirmView,
    CuratorInviteCodeView,
)
from accounts.app_profile_views import (
    AppProfileView,
    AppProfileEmailRequestView,
    AppProfileEmailConfirmView,
    AppProfileTwoFaSetupView,
    AppProfileTwoFaEnableView,
    AppProfileTwoFaDisableView,
    AppProfileDeleteView,
)
from accounts.app_session_views import (
    AppSessionsListView,
    AppSessionDetailView,
    AppLogoutView,
    AppPassportView,
    AppCookieSessionView,
    AppSessionTtlView,
    AppQuickLoginView,
    AppIssueSessionView,
)
from accounts.telegram_webhook_views import TelegramWebhookView
from accounts.kbp_proxy_views import KbpProxyView
from accounts.push_views import PushRegisterView, PushHealthView
from accounts.staff_student_profile_views import StaffStudentAppProfileView
from accounts.admin_views import AppAccountDetailView, AppAccountListView, AppAccountPushNotifyView
from academics.invite_views import RoleInviteCodeView, RoleInviteCodeDetailView
from academics.kbp_catalog_views import KbpCatalogTeachersView
from academics.replacement_views import (
    ReplacementBatchDetailView,
    ReplacementBatchListView,
    ReplacementImportView,
    ReplacementOverlayView,
    ReplacementPublishView,
    ReplacementScanView,
    ReplacementUnpublishView,
)
from academics.enrollment_batch import EnrollmentBatchView
from academics.backup_views import (
    JournalBackupListView,
    JournalBackupRestoreRequestView,
    JournalBackupRestoreConfirmView,
)
from academics.analytics_views import AdminAnalyticsView
from academics.views import (
    GroupViewSet,
    SubjectViewSet,
    EnrollmentViewSet,
    TeachingAssignmentViewSet,
    GradeViewSet,
)
from academics.journal_views import JournalDayViewSet, LatenessViewSet, JournalAccessViewSet, GroupCuratorViewSet
from academics.audit_views import JournalAuditListView
from academics.journal_sync_views import JournalSyncBatchView, JournalSyncResolveView
from academics.presence_views import JournalPresenceHeartbeatView, JournalPresenceStreamView
from accounts.staff_security_views import (
    StaffSecurityStatusView,
    StaffSecuritySettingsView,
    StaffSecurityUnlockPinView,
    StaffSecurityUnlockPasswordView,
    StaffSecurityUnlockPushView,
    StaffSecurityLockView,
    StaffSecurityActivityView,
)
from accounts.jwt_tokens import AppTokenRefreshView


router = DefaultRouter()
router.register(r"teachers", TeacherViewSet, basename="teacher")
router.register(r"students", StudentViewSet, basename="student")
router.register(r"groups", GroupViewSet, basename="group")
router.register(r"subjects", SubjectViewSet, basename="subject")
router.register(r"enrollments", EnrollmentViewSet, basename="enrollment")
router.register(r"assignments", TeachingAssignmentViewSet, basename="assignment")
router.register(r"grades", GradeViewSet, basename="grade")
router.register(r"journal-days", JournalDayViewSet, basename="journal-day")
router.register(r"lateness", LatenessViewSet, basename="lateness")
router.register(r"journal", JournalAccessViewSet, basename="journal")
router.register(r"group-curators", GroupCuratorViewSet, basename="group-curator")


urlpatterns = [
    path("admin/", admin.site.urls),
    path("v0/auth/login/", TeacherLoginView.as_view(), name="teacher-login"),
    path("v0/auth/admin-login/", AdminLoginView.as_view(), name="admin-login"),
    path("v0/auth/student-login/", StudentLoginView.as_view(), name="student-login"),
    path("v0/auth/app/register/", AppRegisterView.as_view(), name="app-register"),
    path("v0/auth/app/login/", AppLoginView.as_view(), name="app-login"),
    path("v0/auth/app/telegram/", AppTelegramLoginView.as_view(), name="app-telegram"),
    path("v0/auth/app/telegram/link/start/", AppTelegramLinkStartView.as_view(), name="app-telegram-link-start"),
    path("v0/auth/app/telegram/link/poll/", AppTelegramLinkPollView.as_view(), name="app-telegram-link-poll"),
    path("v0/telegram/webhook/", TelegramWebhookView.as_view(), name="telegram-webhook"),
    path("v0/auth/app/google/", AppGoogleLoginView.as_view(), name="app-google"),
    path("v0/auth/app/mobile/exchange/", AppMobileAuthExchangeView.as_view(), name="app-mobile-exchange"),
    path("v0/auth/app/mobile/link/start/", AppMobileWebLinkStartView.as_view(), name="app-mobile-link-start"),
    path("v0/auth/app/mobile/link/poll/", AppMobileWebLinkPollView.as_view(), name="app-mobile-link-poll"),
    path("v0/auth/app/mobile/link/complete/", AppMobileWebLinkCompleteView.as_view(), name="app-mobile-link-complete"),
    path("v0/auth/app/verify/", AppVerifyView.as_view(), name="app-verify"),
    path("v0/auth/app/verify-email/", AppVerifyEmailView.as_view(), name="app-verify-email"),
    path("v0/auth/app/2fa/", AppTwoFaLoginView.as_view(), name="app-2fa-login"),
    path("v0/auth/app/password-reset/", AppPasswordResetRequestView.as_view(), name="app-password-reset"),
    path("v0/auth/app/password-reset/confirm/", AppPasswordResetConfirmView.as_view(), name="app-password-reset-confirm"),
    path("v0/auth/curator-invite-code/", CuratorInviteCodeView.as_view(), name="curator-invite-code"),
    path("v0/role-invite-codes/", RoleInviteCodeView.as_view(), name="role-invite-codes"),
    path("v0/role-invite-codes/<int:pk>/", RoleInviteCodeDetailView.as_view(), name="role-invite-code-detail"),
    path("v0/kbp-catalog/teachers/", KbpCatalogTeachersView.as_view(), name="kbp-catalog-teachers"),
    path("v0/replacements/scan/", ReplacementScanView.as_view(), name="replacements-scan"),
    path("v0/replacements/import/", ReplacementImportView.as_view(), name="replacements-import"),
    path("v0/replacements/overlay/", ReplacementOverlayView.as_view(), name="replacements-overlay"),
    path("v0/replacements/", ReplacementBatchListView.as_view(), name="replacements-list"),
    path("v0/replacements/<int:pk>/", ReplacementBatchDetailView.as_view(), name="replacements-detail"),
    path("v0/replacements/<int:pk>/publish/", ReplacementPublishView.as_view(), name="replacements-publish"),
    path("v0/replacements/<int:pk>/unpublish/", ReplacementUnpublishView.as_view(), name="replacements-unpublish"),
    path("v0/enrollments/batch/", EnrollmentBatchView.as_view(), name="enrollment-batch"),
    path("v0/journal-backups/", JournalBackupListView.as_view(), name="journal-backups"),
    path("v0/journal-backups/<int:pk>/restore-request/", JournalBackupRestoreRequestView.as_view(), name="journal-backup-restore-request"),
    path("v0/journal-backups/<int:pk>/restore-confirm/", JournalBackupRestoreConfirmView.as_view(), name="journal-backup-restore-confirm"),
    path("v0/admin/analytics/", AdminAnalyticsView.as_view(), name="admin-analytics"),
    path("v0/app/profile/", AppProfileView.as_view(), name="app-profile"),
    path("v0/app/profile/email/request/", AppProfileEmailRequestView.as_view(), name="app-profile-email-request"),
    path("v0/app/profile/email/confirm/", AppProfileEmailConfirmView.as_view(), name="app-profile-email-confirm"),
    path("v0/app/profile/2fa/setup/", AppProfileTwoFaSetupView.as_view(), name="app-profile-2fa-setup"),
    path("v0/app/profile/2fa/enable/", AppProfileTwoFaEnableView.as_view(), name="app-profile-2fa-enable"),
    path("v0/app/profile/2fa/disable/", AppProfileTwoFaDisableView.as_view(), name="app-profile-2fa-disable"),
    path("v0/app/profile/delete/", AppProfileDeleteView.as_view(), name="app-profile-delete"),
    path("v0/auth/sessions/", AppSessionsListView.as_view(), name="app-sessions"),
    path("v0/auth/sessions/<int:pk>/", AppSessionDetailView.as_view(), name="app-session-detail"),
    path("v0/auth/sessions/ttl/", AppSessionTtlView.as_view(), name="app-session-ttl"),
    path("v0/auth/logout/", AppLogoutView.as_view(), name="app-logout"),
    path("v0/auth/passport/", AppPassportView.as_view(), name="app-passport"),
    path("v0/auth/cookie-session/", AppCookieSessionView.as_view(), name="app-cookie-session"),
    path("v0/auth/quick-login/", AppQuickLoginView.as_view(), name="app-quick-login"),
    path("v0/auth/issue-session/", AppIssueSessionView.as_view(), name="app-issue-session"),
    path("v0/staff/students/<int:student_id>/app-profile/", StaffStudentAppProfileView.as_view(), name="staff-student-app-profile"),
    path("v0/app-accounts/", AppAccountListView.as_view(), name="app-accounts"),
    path("v0/app-accounts/<int:pk>/", AppAccountDetailView.as_view(), name="app-account-detail"),
    path("v0/app-accounts/<int:pk>/push/", AppAccountPushNotifyView.as_view(), name="app-account-push"),
    path("v0/auth/refresh/", AppTokenRefreshView.as_view(), name="token-refresh"),
    path("v0/public/groups/", PublicGroupListView.as_view(), name="public-groups"),
    path("v0/public/app-config/", PublicAppConfigView.as_view(), name="public-app-config"),
    path("v0/student/journal/", StudentJournalView.as_view(), name="student-journal"),
    path("v0/student/lateness/", StudentLatenessView.as_view(), name="student-lateness"),
    path("v0/kbp/proxy/", KbpProxyView.as_view(), name="kbp-proxy"),
    path("v0/push/register/", PushRegisterView.as_view(), name="push-register"),
    path("v0/push/health/", PushHealthView.as_view(), name="push-health"),
    path("v0/journal-audit/", JournalAuditListView.as_view(), name="journal-audit"),
    path("v0/journal-sync/batch/", JournalSyncBatchView.as_view(), name="journal-sync-batch"),
    path("v0/journal-sync/resolve/", JournalSyncResolveView.as_view(), name="journal-sync-resolve"),
    path("v0/journal-presence/heartbeat/", JournalPresenceHeartbeatView.as_view(), name="journal-presence-heartbeat"),
    path("v0/journal-presence/stream/", JournalPresenceStreamView.as_view(), name="journal-presence-stream"),
    path("v0/staff-security/status/", StaffSecurityStatusView.as_view(), name="staff-security-status"),
    path("v0/staff-security/settings/", StaffSecuritySettingsView.as_view(), name="staff-security-settings"),
    path("v0/staff-security/unlock/", StaffSecurityUnlockPinView.as_view(), name="staff-security-unlock"),
    path("v0/staff-security/unlock-password/", StaffSecurityUnlockPasswordView.as_view(), name="staff-security-unlock-password"),
    path("v0/staff-security/unlock-push/", StaffSecurityUnlockPushView.as_view(), name="staff-security-unlock-push"),
    path("v0/staff-security/lock/", StaffSecurityLockView.as_view(), name="staff-security-lock"),
    path("v0/staff-security/activity/", StaffSecurityActivityView.as_view(), name="staff-security-activity"),
    path("v0/", include(router.urls)),
]