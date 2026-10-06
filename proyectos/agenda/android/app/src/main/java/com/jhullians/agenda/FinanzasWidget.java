package com.jhullians.agenda;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.view.View;
import android.widget.RemoteViews;
import org.json.JSONObject;

/** Widget "Finanzas": saldo disponible, ingresos y gastos del mes y accesos rápidos. */
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
        v.setTextViewText(R.id.w_mesNombre, WidgetUtil.format("MMMM"));

        JSONObject d = WidgetUtil.data(ctx, "finanzas");
        if (d == null) {
            v.setTextViewText(R.id.w_saldo, "$ 0");
            v.setTextViewText(R.id.w_estado, "Abre la app para registrar tu plata.");
            v.setProgressBar(R.id.w_in_bar, 100, 0, false);
            v.setProgressBar(R.id.w_out_bar, 100, 0, false);
            return v;
        }

        boolean negative = d.optBoolean("neg", false);
        v.setTextViewText(R.id.w_saldo, d.optString("saldo", "$ 0"));
        v.setTextColor(R.id.w_saldo, ctx.getColor(negative ? R.color.w_danger : R.color.w_ink));
        v.setTextColor(R.id.w_estado, ctx.getColor(negative ? R.color.w_danger : R.color.w_muted));

        if (WidgetUtil.thisMonth().equals(d.optString("mes", ""))) {
            v.setTextViewText(R.id.w_estado, d.optString("estado", ""));
            v.setTextViewText(R.id.w_ing, d.optString("ing", "$ 0"));
            v.setTextViewText(R.id.w_gas, d.optString("gas", "$ 0"));
            v.setProgressBar(R.id.w_in_bar, 100, d.optInt("ingPct", 0), false);
            v.setProgressBar(R.id.w_out_bar, 100, d.optInt("gasPct", 0), false);
            String budget = d.optString("presupuesto", "");
            v.setViewVisibility(R.id.w_presupuesto, budget.isEmpty() ? View.GONE : View.VISIBLE);
            v.setTextViewText(R.id.w_presupuesto, budget);
        } else {
            v.setTextViewText(R.id.w_estado, negative ? "Estás en negativo" : "Mes nuevo: abre la app para actualizar");
            v.setTextViewText(R.id.w_ing, "$ 0");
            v.setTextViewText(R.id.w_gas, "$ 0");
            v.setProgressBar(R.id.w_in_bar, 100, 0, false);
            v.setProgressBar(R.id.w_out_bar, 100, 0, false);
            v.setViewVisibility(R.id.w_presupuesto, View.GONE);
        }
        return v;
    }
}
