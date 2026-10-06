package com.jhullians.agenda;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.widget.RemoteViews;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

final class WidgetUtil {

    static final Locale ES = new Locale("es", "CO");

    private WidgetUtil() {}

    /** Abre la app en la sección indicada por el enlace agenda://... */
    static PendingIntent open(Context ctx, String link, int requestCode) {
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(link), ctx, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(ctx, requestCode, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static String today() {
        return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
    }

    static String thisMonth() {
        return new SimpleDateFormat("yyyy-MM", Locale.US).format(new Date());
    }

    static String capitalize(String s) {
        if (s == null || s.isEmpty()) return "";
        return s.substring(0, 1).toUpperCase(ES) + s.substring(1);
    }

    static void push(Context ctx, Class<?> provider, RemoteViews views) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        int[] ids = mgr.getAppWidgetIds(new ComponentName(ctx, provider));
        for (int id : ids) mgr.updateAppWidget(id, views);
    }
}
