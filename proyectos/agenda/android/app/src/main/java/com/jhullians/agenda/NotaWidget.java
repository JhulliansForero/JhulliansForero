package com.jhullians.agenda;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.view.View;
import android.widget.RemoteViews;
import org.json.JSONObject;

/** Widget "Nota": la nota fijada (o la más reciente) con su color. */
public class NotaWidget extends AppWidgetProvider {

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        RemoteViews views = build(ctx);
        for (int id : ids) mgr.updateAppWidget(id, views);
    }

    static void refreshAll(Context ctx) {
        WidgetUtil.push(ctx, NotaWidget.class, build(ctx));
    }

    static RemoteViews build(Context ctx) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_nota);
        v.setOnClickPendingIntent(R.id.w_add, WidgetUtil.open(ctx, "agenda://notas/nueva", 31));

        JSONObject d = WidgetUtil.data(ctx, "nota");
        String id = d == null ? "" : d.optString("id", "");
        if (id.isEmpty()) {
            v.setInt(R.id.w_root, "setBackgroundResource", R.drawable.note_bg_verde);
            v.setTextViewText(R.id.w_eyebrow, "NOTAS");
            v.setTextViewText(R.id.w_title, "Tus notas");
            v.setTextViewText(R.id.w_body, "Toca + para escribir tu primera nota. La que fijes aparecerá aquí.");
            v.setViewVisibility(R.id.w_meta, View.GONE);
            v.setOnClickPendingIntent(R.id.w_root, WidgetUtil.open(ctx, "agenda://notas", 30));
            return v;
        }

        v.setInt(R.id.w_root, "setBackgroundResource", WidgetUtil.noteBackground(d.optString("color", "verde")));
        v.setTextViewText(R.id.w_eyebrow, d.optBoolean("pinned", false) ? "NOTA FIJADA" : "NOTA RECIENTE");
        v.setTextViewText(R.id.w_title, d.optString("title", "Nota"));
        String body = d.optString("body", "");
        v.setTextViewText(R.id.w_body, body.isEmpty() ? "Sin contenido" : body);
        String progress = d.optString("progress", "");
        int total = d.optInt("total", 1);
        String meta = progress.isEmpty() ? (total > 1 ? total + " notas en total" : "") : progress;
        v.setViewVisibility(R.id.w_meta, meta.isEmpty() ? View.GONE : View.VISIBLE);
        v.setTextViewText(R.id.w_meta, meta);
        v.setOnClickPendingIntent(R.id.w_root, WidgetUtil.open(ctx, "agenda://notas/ver/" + id, 30));
        return v;
    }
}
