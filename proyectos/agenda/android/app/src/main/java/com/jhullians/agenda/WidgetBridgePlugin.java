package com.jhullians.agenda;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Recibe desde la app web los datos que muestran los widgets de la pantalla de inicio. */
@CapacitorPlugin(name = "WidgetBridge")
public class WidgetBridgePlugin extends Plugin {

    public static final String PREFS = "agenda_widgets";

    @PluginMethod
    public void update(PluginCall call) {
        String agenda = call.getString("agenda");
        String finanzas = call.getString("finanzas");
        Context ctx = getContext();
        SharedPreferences.Editor editor = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit();
        if (agenda != null) editor.putString("agenda", agenda);
        if (finanzas != null) editor.putString("finanzas", finanzas);
        editor.apply();
        AgendaWidget.refreshAll(ctx);
        FinanzasWidget.refreshAll(ctx);
        call.resolve();
    }

    /** Pide al launcher que agregue un widget a la pantalla de inicio (Android 8+). */
    @PluginMethod
    public void pin(PluginCall call) {
        String kind = call.getString("kind", "agenda");
        Context ctx = getContext();
        JSObject ret = new JSObject();
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            ret.put("supported", false);
            call.resolve(ret);
            return;
        }
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        if (!mgr.isRequestPinAppWidgetSupported()) {
            ret.put("supported", false);
            call.resolve(ret);
            return;
        }
        Class<?> cls = "finanzas".equals(kind) ? FinanzasWidget.class : AgendaWidget.class;
        boolean ok = mgr.requestPinAppWidget(new ComponentName(ctx, cls), null, null);
        ret.put("supported", ok);
        call.resolve(ret);
    }
}
