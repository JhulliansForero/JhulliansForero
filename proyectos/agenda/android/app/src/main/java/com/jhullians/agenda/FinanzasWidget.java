package com.jhullians.agenda;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.widget.RemoteViews;
import org.json.JSONObject;

/** Widget "Finanzas": saldo disponible, movimientos del mes y accesos rápidos. */
public class FinanzasWidget extends AppWidgetProvider {

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        RemoteViews views = build(ctx);
        for (int id : ids) mgr.updateAppWidget(id, views);
    }

    static void refreshAll(Context ctx) {
        WidgetUtil.push(ctx, FinanzasWidget.class, build(ctx));
    }

    static RemoteViews build(Context ctx) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_finanzas);
        v.setOnClickPendingIntent(R.id.w_root, WidgetUtil.open(ctx, "agenda://finanzas", 20));
        v.setOnClickPendingIntent(R.id.w_gasto, WidgetUtil.open(ctx, "agenda://finanzas/gasto", 21));
        v.setOnClickPendingIntent(R.id.w_ingreso, WidgetUtil.open(ctx, "agenda://finanzas/ingreso", 22));

        JSONObject data = null;
        try {
            String raw = ctx.getSharedPreferences(WidgetBridgePlugin.PREFS, Context.MODE_PRIVATE).getString("finanzas", null);
            if (raw != null) data = new JSONObject(raw);
        } catch (Exception e) {
            data = null;
        }

        if (data == null) {
            v.setTextViewText(R.id.w_saldo, "$ 0");
            v.setTextColor(R.id.w_saldo, ctx.getColor(R.color.w_ink));
            v.setTextViewText(R.id.w_mes, "Abre la app para registrar tus ingresos y gastos.");
            return v;
        }

        boolean negative = data.optBoolean("neg", false);
        v.setTextViewText(R.id.w_saldo, data.optString("saldo", "$ 0"));
        v.setTextColor(R.id.w_saldo, ctx.getColor(negative ? R.color.w_danger : R.color.w_ink));

        if (WidgetUtil.thisMonth().equals(data.optString("mes", ""))) {
            v.setTextViewText(R.id.w_mes, data.optString("mesNombre", "Este mes") + ": +" + data.optString("ing", "$ 0") + "  ·  −" + data.optString("gas", "$ 0"));
        } else {
            v.setTextViewText(R.id.w_mes, "Mes nuevo: abre la app para ver tus movimientos.");
        }
        return v;
    }
}
