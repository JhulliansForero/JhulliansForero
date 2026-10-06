package com.jhullians.agenda;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.widget.RemoteViews;
import org.json.JSONObject;

/** Widget "Resumen": hoy, hábitos, saldo y nota en cuatro bloques. */
public class ResumenWidget extends AppWidgetProvider {

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        RemoteViews views = build(ctx);
        for (int id : ids) mgr.updateAppWidget(id, views);
    }

    static void refreshAll(Context ctx) {
        WidgetUtil.push(ctx, ResumenWidget.class, build(ctx));
    }

    static RemoteViews build(Context ctx) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_resumen);
        TodayData t = TodayData.load(ctx);

        v.setTextViewText(R.id.w_eyebrow, WidgetUtil.format("EEEE").toUpperCase(WidgetUtil.ES));
        v.setTextViewText(R.id.w_date, WidgetUtil.format("d 'de' MMMM"));
        v.setTextViewText(R.id.w_count, t.countLabel());
        v.setOnClickPendingIntent(R.id.w_root, WidgetUtil.open(ctx, "agenda://hoy", 40));
        v.setOnClickPendingIntent(R.id.w_add, WidgetUtil.open(ctx, "agenda://hoy/nueva", 41));

        // Pendientes de hoy
        v.setOnClickPendingIntent(R.id.t_hoy, WidgetUtil.open(ctx, "agenda://hoy", 42));
        v.setTextViewText(R.id.t_hoy_big, String.valueOf(t.pending));
        String sub;
        if (t.next != null) sub = "Sigue: " + t.next.optString("t", "") + " · " + t.next.optString("s", "");
        else if (t.pending > 0) sub = t.pending == 1 ? "Te queda una por hacer" : "Te quedan por hacer";
        else if (t.done > 0) sub = "¡Todo listo por hoy!";
        else if (t.upcoming != null) sub = "Libre hoy. Próximo: " + t.upcoming.optString("t", "");
        else sub = "Día libre";
        v.setTextViewText(R.id.t_hoy_sub, sub);

        // Hábitos
        v.setOnClickPendingIntent(R.id.t_hab, WidgetUtil.open(ctx, "agenda://hoy", 43));
        if (t.habitsKnown && t.habitsTotal > 0) {
            v.setTextViewText(R.id.t_hab_big, t.habitsDone + "/" + t.habitsTotal);
            v.setProgressBar(R.id.t_hab_bar, t.habitsTotal, t.habitsDone, false);
            v.setTextViewText(R.id.t_hab_sub, t.habitsDone == t.habitsTotal ? "¡Todos cumplidos!" : "Cumplidos hoy");
        } else {
            v.setTextViewText(R.id.t_hab_big, "—");
            v.setProgressBar(R.id.t_hab_bar, 1, 0, false);
            v.setTextViewText(R.id.t_hab_sub, "Hoy no tienes hábitos");
        }

        // Finanzas
        v.setOnClickPendingIntent(R.id.t_fin, WidgetUtil.open(ctx, "agenda://finanzas", 44));
        JSONObject f = WidgetUtil.data(ctx, "finanzas");
        if (f != null) {
            boolean negative = f.optBoolean("neg", false);
            v.setTextViewText(R.id.t_fin_big, f.optString("saldo", "$ 0"));
            v.setTextColor(R.id.t_fin_big, ctx.getColor(negative ? R.color.w_danger : R.color.w_ink));
            boolean sameMonth = WidgetUtil.thisMonth().equals(f.optString("mes", ""));
            v.setTextViewText(R.id.t_fin_sub, sameMonth ? "Gastos del mes: " + f.optString("gas", "$ 0") : "Mes nuevo");
        } else {
            v.setTextViewText(R.id.t_fin_big, "$ 0");
            v.setTextViewText(R.id.t_fin_sub, "Registra tus ingresos");
        }

        // Nota
        JSONObject n = WidgetUtil.data(ctx, "nota");
        String noteId = n == null ? "" : n.optString("id", "");
        if (noteId.isEmpty()) {
            v.setTextViewText(R.id.t_nota_big, "Notas");
            v.setTextViewText(R.id.t_nota_sub, "Toca para escribir una");
            v.setOnClickPendingIntent(R.id.t_nota, WidgetUtil.open(ctx, "agenda://notas/nueva", 45));
        } else {
            v.setTextViewText(R.id.t_nota_big, n.optString("title", "Nota"));
            v.setTextViewText(R.id.t_nota_sub, n.optString("body", ""));
            v.setOnClickPendingIntent(R.id.t_nota, WidgetUtil.open(ctx, "agenda://notas/ver/" + noteId, 45));
        }
        return v;
    }
}
