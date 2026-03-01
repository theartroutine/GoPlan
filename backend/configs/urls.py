from django.contrib import admin
from django.urls import path, include

# -------- Root URL Patterns --------
urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('api.urls')),
]
