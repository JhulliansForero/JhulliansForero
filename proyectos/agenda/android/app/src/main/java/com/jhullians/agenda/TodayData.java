package com.jhullians.agenda;

import android.content.Context;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;

/** Lo que toca hoy según los datos que dejó la app: actividades, siguiente y hábitos. */
final class TodayData {

    final List<JSONObject> today = new ArrayList<>();
    JSONObject next;
    JSONObject upcoming;
    int pending;
    int done;
    int habitsTotal;
    int habitsDone;
    boolean habitsKnown;

    static TodayData load(Context ctx) {
        TodayData t = new TodayData();
        JSONObject data = WidgetUtil.data(ctx, "agenda");
        if (data == null) return t;
        String today = WidgetUtil.today();
        String now = WidgetUtil.nowTime();
        JSONArray items = data.optJSONArray("items");
        if (items != null) {
            for (int i = 0; i < items.length(); i++) {
                JSONObject it = items.optJSONObject(i);
                if (it == null) continue;
                String date = it.optString("d", "");
                boolean isDone = it.optBoolean("x", false);
                if (today.equals(date)) {
                    t.today.add(it);
                    if (isDone) t.done++;
                    else t.pending++;
                    String start = it.optString("s", "");
                    String end = it.optString("e", "");
                    if (!isDone && t.next == null && !start.isEmpty() && (end.isEmpty() ? start : end).compareTo(now) >= 0) t.next = it;
                } else if (t.upcoming == null && date.compareTo(today) > 0 && !isDone) {
                    t.upcoming = it;
                }
            }
        }
        JSONObject habits = data.optJSONObject("habits");
        // Los hábitos solo valen si son del día de hoy.
        if (habits != null && today.equals(habits.optString("day", ""))) {
            t.habitsKnown = true;
            t.habitsTotal = habits.optInt("total", 0);
            t.habitsDone = habits.optInt("done", 0);
        }
        return t;
    }

    static String timeLabel(JSONObject it) {
        String start = it.optString("s", "");
        String end = it.optString("e", "");
        if (start.isEmpty()) return "Todo el día";
        return end.isEmpty() ? start : start + "–" + end;
    }

    String countLabel() {
        if (pending == 0 && done == 0) return "Nada en la agenda";
        if (pending == 0) return "¡Todo listo por hoy!";
        return pending + (pending == 1 ? " pendiente" : " pendientes") + (done > 0 ? " · " + done + (done == 1 ? " hecha" : " hechas") : "");
    }
}
