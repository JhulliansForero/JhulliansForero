package com.jhullians.agenda;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.view.View;
import android.widget.RemoteViews;
import org.json.JSONObject;

/** Widget "Hoy": actividades del día y progreso de los hábitos. */
public class AgendaWidget extends AppWidgetProvider {

    private static final int[] ROWS = { R.id.w_row1, R.id.w_row2, R.id.w_row3, R.id.w_row4, R.id.w_row5 };
    private static final int[] BARS = { R.id.w_bar1, R.id.w_bar2, R.id.w_bar3, R.id.w_bar4, R.id.w_bar5 };
    private static final int[] TEXTS = { R.id.w_text1, R.id.w_text2, R.id.w_text3, R.id.w_text4, R.id.w_text5 };
    private static final int[] TIMES = { R.id.w_time1, R.id.w_time2, R.id.w_time3, R.id.w_time4, R.id.w_time5 };
    private static final int[] CHECKS = { R.id.w_check1, R.id.w_check2, R.id.w_check3, R.id.w_check4, R.id.w_check5 };

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        RemoteViews views = build(ctx);
        for (int id : ids) mgr.updateAppWidget(id, views);
    }

    static void refreshAll(Context ctx) {
        WidgetUtil.push(ctx, AgendaWidget.class, build(ctx));
    }

    static RemoteViews build(Context ctx) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_agenda);
        TodayData t = TodayData.load(ctx);
        v.setTextViewText(R.id.w_eyebrow, WidgetUtil.format("EEEE").toUpperCase(WidgetUtil.ES));
        v.setTextViewText(R.id.w_date, WidgetUtil.format("d 'de' MMMM"));
        v.setTextViewText(R.id.w_count, t.countLabel());
        v.setOnClickPendingIntent(R.id.w_root, WidgetUtil.open(ctx, "agenda://hoy", 10));
        v.setOnClickPendingIntent(R.id.w_add, WidgetUtil.open(ctx, "agenda://hoy/nueva", 11));

        int shown = 0;
        for (JSONObject it : t.today) {
            if (shown >= ROWS.length) break;
            boolean isDone = it.optBoolean("x", false);
            v.setViewVisibility(ROWS[shown], View.VISIBLE);
            v.setInt(BARS[shown], "setBackgroundColor", WidgetUtil.categoryColor(ctx, it.optString("c", "otro")));
            v.setTextViewText(TEXTS[shown], it.optString("t", ""));
            v.setTextColor(TEXTS[shown], ctx.getColor(isDone ? R.color.w_muted : R.color.w_ink));
            v.setTextViewText(TIMES[shown], TodayData.timeLabel(it));
            v.setViewVisibility(CHECKS[shown], isDone ? View.VISIBLE : View.GONE);
            shown++;
        }
        for (int i = shown; i < ROWS.length; i++) v.setViewVisibility(ROWS[i], View.GONE);

        if (shown == 0) {
            v.setViewVisibility(R.id.w_empty, View.VISIBLE);
            String msg = "Nada para hoy. Toca + para agregar una actividad.";
            if (t.upcoming != null) msg = "Hoy estás libre. Lo próximo: " + t.upcoming.optString("t", "") + ".";
            v.setTextViewText(R.id.w_empty, msg);
        } else {
            v.setViewVisibility(R.id.w_empty, View.GONE);
        }

        if (t.habitsKnown && t.habitsTotal > 0) {
            v.setViewVisibility(R.id.w_hab_box, View.VISIBLE);
            v.setProgressBar(R.id.w_hab_bar, t.habitsTotal, t.habitsDone, false);
            v.setTextViewText(R.id.w_hab_count, t.habitsDone + "/" + t.habitsTotal);
        } else {
            v.setViewVisibility(R.id.w_hab_box, View.GONE);
        }
        return v;
    }
}
