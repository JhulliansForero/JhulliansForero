package com.jhullians.agenda;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.view.View;
import android.widget.RemoteViews;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONObject;

/** Widget "Hoy": actividades del día y la siguiente pendiente. */
public class AgendaWidget extends AppWidgetProvider {

    private static final int[] DOTS = { R.id.w_dot1, R.id.w_dot2, R.id.w_dot3, R.id.w_dot4, R.id.w_dot5 };
    private static final int[] TEXTS = { R.id.w_text1, R.id.w_text2, R.id.w_text3, R.id.w_text4, R.id.w_text5 };
    private static final int[] TIMES = { R.id.w_time1, R.id.w_time2, R.id.w_time3, R.id.w_time4, R.id.w_time5 };
    private static final int[] ROWS = { R.id.w_row1, R.id.w_row2, R.id.w_row3, R.id.w_row4, R.id.w_row5 };

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        RemoteViews views = build(ctx);
        for (int id : ids) mgr.updateAppWidget(id, views);
    }

    static void refreshAll(Context ctx) {
        WidgetUtil.push(ctx, AgendaWidget.class, build(ctx));
    }

    static int categoryColor(Context ctx, String cat) {
        if ("estudio".equals(cat)) return ctx.getColor(R.color.w_cat_estudio);
        if ("practica".equals(cat)) return ctx.getColor(R.color.w_cat_practica);
        if ("personal".equals(cat)) return ctx.getColor(R.color.w_cat_personal);
        if ("salud".equals(cat)) return ctx.getColor(R.color.w_cat_salud);
        return ctx.getColor(R.color.w_cat_otro);
    }

    static RemoteViews build(Context ctx) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_agenda);
        String today = WidgetUtil.today();
        String header = new SimpleDateFormat("EEEE d 'de' MMMM", WidgetUtil.ES).format(new Date());
        v.setTextViewText(R.id.w_date, WidgetUtil.capitalize(header));
        v.setOnClickPendingIntent(R.id.w_root, WidgetUtil.open(ctx, "agenda://hoy", 10));
        v.setOnClickPendingIntent(R.id.w_add, WidgetUtil.open(ctx, "agenda://hoy/nueva", 11));

        JSONArray items = new JSONArray();
        try {
            String raw = ctx.getSharedPreferences(WidgetBridgePlugin.PREFS, Context.MODE_PRIVATE).getString("agenda", null);
            if (raw != null) items = new JSONObject(raw).optJSONArray("items");
            if (items == null) items = new JSONArray();
        } catch (Exception e) {
            items = new JSONArray();
        }

        int shown = 0;
        int pending = 0;
        int done = 0;
        JSONObject next = null;
        for (int i = 0; i < items.length(); i++) {
            JSONObject it = items.optJSONObject(i);
            if (it == null) continue;
            String date = it.optString("d", "");
            boolean isDone = it.optBoolean("x", false);
            if (today.equals(date)) {
                if (isDone) done++;
                else pending++;
                if (shown < ROWS.length) {
                    String start = it.optString("s", "");
                    String end = it.optString("e", "");
                    String time = start.isEmpty() ? "Todo el día" : (end.isEmpty() ? start : start + "–" + end);
                    v.setViewVisibility(ROWS[shown], View.VISIBLE);
                    v.setTextViewText(TEXTS[shown], (isDone ? "✓ " : "") + it.optString("t", ""));
                    v.setTextColor(TEXTS[shown], ctx.getColor(isDone ? R.color.w_muted : R.color.w_ink));
                    v.setTextViewText(TIMES[shown], time);
                    v.setTextColor(DOTS[shown], categoryColor(ctx, it.optString("c", "otro")));
                    shown++;
                }
            } else if (next == null && date.compareTo(today) > 0 && !isDone) {
                next = it;
            }
        }
        for (int i = shown; i < ROWS.length; i++) v.setViewVisibility(ROWS[i], View.GONE);

        String count;
        if (pending == 0 && done == 0) count = "Nada para hoy";
        else if (pending == 0) count = "¡Todo listo!";
        else count = pending + (pending == 1 ? " pendiente" : " pendientes");
        v.setTextViewText(R.id.w_count, count);

        if (shown == 0) {
            v.setViewVisibility(R.id.w_empty, View.VISIBLE);
            String msg = "Toca para agregar una actividad o pedirle ayuda a Claude.";
            if (next != null) {
                try {
                    Date d = new SimpleDateFormat("yyyy-MM-dd", Locale.US).parse(next.optString("d"));
                    String when = new SimpleDateFormat("EEE d MMM", WidgetUtil.ES).format(d);
                    String start = next.optString("s", "");
                    msg = "Próximo: " + next.optString("t", "") + " · " + when + (start.isEmpty() ? "" : " " + start);
                } catch (Exception ignored) {
                    // se queda el mensaje por defecto
                }
            }
            v.setTextViewText(R.id.w_empty, msg);
        } else {
            v.setViewVisibility(R.id.w_empty, View.GONE);
        }
        return v;
    }
}
