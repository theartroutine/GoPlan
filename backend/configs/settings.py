import os

from datetime import timedelta
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent.parent


def env_bool(name: str, default: bool = False) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


# -------- Core Flags --------
DEBUG = os.environ.get('DJANGO_DEBUG') == '1'
SECRET_KEY = os.environ['DJANGO_SECRET_KEY']
ALLOWED_HOSTS = os.environ['DJANGO_ALLOWED_HOSTS'].split(',')

# -------- Installed Apps --------
INSTALLED_APPS = [
    'daphne',

    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',

    # Third-party apps
    'corsheaders',
    'rest_framework',
    'rest_framework_simplejwt',
    'rest_framework_simplejwt.token_blacklist',
    'channels',

    # Local apps
    'api',
    'accounts',
    'realtime',
    'notifications',
    'friends',
    'trips',
    'expenses',
    'ai.apps.AIConfig',
    'chat',
    'media',

]

# -------- Middleware Chain --------
MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'configs.urls'

# WSGI entrypoint (traditional HTTP)
WSGI_APPLICATION = 'configs.wsgi.application'

# ASGI entrypoint (HTTP + WebSocket via Channels/Daphne)
ASGI_APPLICATION = 'configs.asgi.application'

# -------- Templates --------
TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {'context_processors': [
            'django.template.context_processors.request',
            'django.contrib.auth.context_processors.auth',
            'django.contrib.messages.context_processors.messages',
        ]},
    },
]

# -------- Database (PostgreSQL) --------
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': os.environ['DB_NAME'],
        'USER': os.environ['DB_USER'],
        'PASSWORD': os.environ['DB_PASSWORD'],
        'HOST': os.environ['DB_HOST'],
        'PORT': os.environ['DB_PORT'],
        'CONN_MAX_AGE': 600,
    }
}

# -------- Authentication Policies --------
AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

# -------- Locale --------
LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'Asia/Ho_Chi_Minh'
USE_I18N = True
USE_TZ = True

# -------- Static Files --------
STATIC_URL = 'static/'

# -------- Media Files --------
MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media_files'
UPLOAD_MAX_BYTES = 5 * 1024 * 1024
DATA_UPLOAD_MAX_MEMORY_SIZE = UPLOAD_MAX_BYTES
FILE_UPLOAD_MAX_MEMORY_SIZE = UPLOAD_MAX_BYTES

# -------- Cross-Origin Settings --------
CORS_ALLOWED_ORIGINS = os.environ['CORS_ALLOWED_ORIGINS'].split(',')
CSRF_TRUSTED_ORIGINS = os.environ['CSRF_TRUSTED_ORIGINS'].split(',')

SESSION_COOKIE_SAMESITE = 'Lax'
CSRF_COOKIE_SAMESITE = 'Lax'

if not DEBUG:
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
    SECURE_SSL_REDIRECT = True
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_HSTS_SECONDS = 31536000
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# REST Framework Defaults
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'accounts.authentication.JWTAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    ),
    'DEFAULT_THROTTLE_CLASSES': (
        'rest_framework.throttling.AnonRateThrottle',
        'rest_framework.throttling.UserRateThrottle',
        'rest_framework.throttling.ScopedRateThrottle',
    ),
    'DEFAULT_THROTTLE_RATES': {
        'anon': '100/hour',
        'user': '1000/hour',
        'auth_login': '20/hour',
        'auth_register': '10/hour',
        'auth_refresh': '60/hour',
        'auth_me': '300/hour',
        'auth_logout': '30/hour',
        'auth_profile_setup': '20/hour',
        'auth_profile_name': '60/hour',
        'auth_verify_email': '10/hour',
        'auth_resend_verification': '5/hour',
        'auth_password_reset_request': '5/hour',
        'auth_password_reset_confirm': '10/hour',
        'realtime_ws_ticket': '120/hour',
        'notifications_list': '120/hour',
        'notifications_unread_count': '300/hour',
        'notifications_mark_read': '120/hour',
        'notifications_mark_all_read': '60/hour',
        'friends_send_request': '30/hour',
        'friends_requests_list': '120/hour',
        'friends_respond': '60/hour',
        'friends_list': '120/hour',
        'friends_remove': '30/hour',
        'friends_search': '60/hour',
        'media_upload': '30/hour',
        'trips_list_create': '60/hour',
        'trips_detail_update': '120/hour',
        'trips_send_invitations': '10/hour',
        'trips_invitable_friends': '60/hour',
        'trips_accept_invitation': '30/hour',
        'trips_decline_invitation': '30/hour',
        'trips_start': '20/hour',
        'trips_complete': '20/hour',
        'trips_cancel': '20/hour',
        'trips_remove_member': '30/hour',
        'trips_leave': '30/hour',
        'trips_timeline_detail': '240/hour',
        'trips_timeline_sections': '120/hour',
        'trips_timeline_section_detail': '120/hour',
        'trips_timeline_activities': '240/hour',
        'trips_timeline_activity_detail': '240/hour',
        'trips_timeline_activity_status': '240/hour',
        'trips_timeline_custom_types': '60/hour',
        'trips_timeline_custom_type_detail': '60/hour',
        'expenses_list_create': '120/hour',
        'expenses_detail': '120/hour',
        'expenses_contributions': '240/hour',
        'chat_send': '60/minute',
        'chat_ai_prompt': '20/hour',
        'ai_action_draft': '60/hour',
        'ai_action_confirm': '30/hour',
        'chat_reaction': '120/minute',
        'chat_delete': '60/minute',
        'settlement_finalize': '30/hour',
        'settlement_reopen': '20/hour',
        'settlement_transfer_action': '240/hour',
        'ws_ticket_refresh': '20/minute',
    },
}

if not DEBUG:
    REST_FRAMEWORK['DEFAULT_RENDERER_CLASSES'] = (
        'rest_framework.renderers.JSONRenderer',
    )

# JWT Settings
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=15),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
    'UPDATE_LAST_LOGIN': True,
    'AUTH_HEADER_TYPES': ('Bearer',),
    'AUTH_TOKEN_CLASSES': ('accounts.tokens.AccessToken',),
    'USER_ID_FIELD': 'id',
    'USER_ID_CLAIM': 'user_id',
}

# Custom User Model
AUTH_USER_MODEL = 'accounts.User'

# -------- Email Backend --------
EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
EMAIL_HOST = os.environ.get('EMAIL_HOST', 'localhost')
EMAIL_PORT = int(os.environ.get('EMAIL_PORT', '1025'))
EMAIL_USE_TLS = os.environ.get('EMAIL_USE_TLS', '0') == '1'
DEFAULT_FROM_EMAIL = 'noreply@goplan.app'

# -------- Password Reset --------
PASSWORD_RESET_TIMEOUT = 3600  # 1 hour

# -------- Email Verification --------
EMAIL_VERIFICATION_MAX_AGE_SECONDS = 60 * 60 * 24  # 24 hours
FRONTEND_BASE_URL = os.environ.get('FRONTEND_BASE_URL', 'http://localhost:3000')

# MongoDB Integration
# MONGO_URL = os.environ.get('MONGO_URL')
# MONGO_DB = os.environ.get('MONGO_DB')

# -------- Celery Configuration --------
CELERY_BROKER_URL = os.environ.get("CELERY_BROKER_URL", "redis://localhost:6379/1")
CELERY_RESULT_BACKEND = os.environ.get("CELERY_RESULT_BACKEND", "redis://localhost:6379/2")
CELERY_TASK_ACKS_LATE = True
CELERY_TASK_REJECT_ON_WORKER_LOST = True
CELERY_WORKER_PREFETCH_MULTIPLIER = 1
CELERY_TASK_TIME_LIMIT = int(os.environ.get("CELERY_TASK_TIME_LIMIT", "120"))
CELERY_TASK_SOFT_TIME_LIMIT = int(os.environ.get("CELERY_TASK_SOFT_TIME_LIMIT", "90"))

# -------- DeepSeek AI Configuration --------
DEEPSEEK_API_KEY = os.environ.get("DEEPSEEK_API_KEY", "")
DEEPSEEK_BASE_URL = os.environ.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com")
DEEPSEEK_MODEL = os.environ.get("DEEPSEEK_MODEL", "deepseek-v4-flash")
DEEPSEEK_TIMEOUT_SECONDS = int(os.environ.get("DEEPSEEK_TIMEOUT_SECONDS", "60"))
DEEPSEEK_MAX_OUTPUT_TOKENS = int(os.environ.get("DEEPSEEK_MAX_OUTPUT_TOKENS", "4000"))
GOPLAN_AI_THINKING_ENABLED = env_bool("GOPLAN_AI_THINKING_ENABLED", default=True)
GOPLAN_AI_REASONING_EFFORT = os.environ.get("GOPLAN_AI_REASONING_EFFORT", "high")
GOPLAN_AI_LOCK_TTL_SECONDS = int(os.environ.get("GOPLAN_AI_LOCK_TTL_SECONDS", "120"))
GOPLAN_AI_MAX_ATTEMPTS = int(os.environ.get("GOPLAN_AI_MAX_ATTEMPTS", "3"))
GOPLAN_AI_ACTION_DRAFT_TTL_SECONDS = int(
    os.environ.get("GOPLAN_AI_ACTION_DRAFT_TTL_SECONDS", str(60 * 60 * 24))
)
GOPLAN_AI_CONTEXT_RECENT_CHAT_LIMIT = int(
    os.environ.get("GOPLAN_AI_CONTEXT_RECENT_CHAT_LIMIT", "20")
)
GOPLAN_AI_CONTEXT_TIMELINE_ACTIVITY_LIMIT = int(
    os.environ.get("GOPLAN_AI_CONTEXT_TIMELINE_ACTIVITY_LIMIT", "120")
)
GOPLAN_AI_CONTEXT_EXPENSE_LIMIT = int(
    os.environ.get("GOPLAN_AI_CONTEXT_EXPENSE_LIMIT", "80")
)
GOPLAN_AI_SYSTEM_PROMPT = (
    "You are GoPlanAI, a concise assistant inside a group trip planning chat. "
    "Answer the user's prompt helpfully. Do not claim access to trip data, "
    "chat history, expenses, itinerary, or members unless they are provided "
    "in the prompt. "
    "Format using Markdown: use **bold** for emphasis and section titles "
    "(never use # ## ### headings), use bullet lists where helpful, "
    "and use fenced code blocks with language tags for any code snippets."
)

# -------- Channels Configuration --------
REDIS_URL = os.environ.get('REDIS_URL', 'redis://localhost:6379/0')

CHANNEL_LAYERS = {
    'default': {
        'BACKEND': 'channels_redis.core.RedisChannelLayer',
        'CONFIG': {
            'hosts': [REDIS_URL],
        },
    },
}

# -------- WebSocket Configuration --------
WS_HEARTBEAT_INTERVAL = 30  # seconds
WS_TICKET_LIFETIME_SECONDS = 60
WS_MAX_CHAT_SUBSCRIPTIONS_PER_CONNECTION = 20
WS_SUBPROTOCOL = 'goplan.realtime.v1'

WS_CLOSE_CODES = {
    'AUTH_FAILED': 4001,      # Token invalid/revoked — client should not retry
    'TOKEN_EXPIRED': 4002,    # Token expired — client should refresh then retry
    'SERVER_ERROR': 4500,
}
