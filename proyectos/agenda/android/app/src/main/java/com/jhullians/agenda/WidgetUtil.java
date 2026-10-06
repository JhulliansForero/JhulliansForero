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
import org.json.JSONObject;

final class WidgetUtil {

    static final Locale ES = new Locale("es", "CO");

    private WidgetUtil() {}

    /** Abre la app en la sección indicada por el enlace agenda://... */
    static PendingIntent open(Context ctx, String link, int requestCode) {
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(link), ctx, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(ctx, requestCode, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** Datos que la app guardó para los widgets (o null si aún no hay). */
    static JSONObject data(Context ctx, String key) {
        try {
            String raw = ctx.getSharedPreferences(WidgetBridgePlugin.PREFS, Context.MODE_PRIVATE).getString(key, null);
            return raw == null ? null : new JSONObject(raw);
        } catch (Exception e) {
            return null;
        }
    }

    static String today() {
        return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
    }

    static String thisMonth() {
        return new SimpleDateFormat("yyyy-MM", Locale.US).format(new Date());
    }

    static String nowTime() {
        return new SimpleDateFormat("HH:mm", Locale.US).format(new Date());
    }

    static String capitalize(String s) {
        if (s == null || s.isEmpty()) return "";
        return s.substring(0, 1).toUpperCase(ES) + s.substring(1);
    }

    static String format(String pattern) {
        return capitalize(new SimpleDateFormat(pattern, ES).format(new Date()));
    }

    static int categoryColor(Context ctx, String cat) {
        if ("estudio".equals(cat)) return ctx.getColor(R.color.w_cat_estudio);
        if ("practica".equals(cat)) return ctx.getColor(R.color.w_cat_practica);
        if ("personal".equals(cat)) return ctx.getColor(R.color.w_cat_personal);
        if ("salud".equals(cat)) return ctx.getColor(R.color.w_cat_salud);
        return ctx.getColor(R.color.w_cat_otro);
    }

    static int noteBackground(String color) {
        if ("azul".equals(color)) return R.drawable.note_bg_azul;
        if ("amarillo".equals(color)) return R.drawable.note_bg_amarillo;
        if ("rosa".equals(color)) return R.drawable.note_bg_rosa;
        if ("lila".equals(color)) return R.drawable.note_bg_lila;
        if ("gris".equals(color)) return R.drawable.note_bg_gris;
        return R.drawable.note_bg_verde;
    }

    static void push(Context ctx, Class<?> provider, RemoteViews views) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        int[] ids = mgr.getAppWidgetIds(new ComponentName(ctx, provider));
        for (int id : ids) mgr.updateAppWidget(id, views);
    }

    static void refreshAll(Context ctx) {
        AgendaWidget.refreshAll(ctx);
        FinanzasWidget.refreshAll(ctx);
        NotaWidget.refreshAll(ctx);
        ResumenWidget.refreshAll(ctx);
    }
}
