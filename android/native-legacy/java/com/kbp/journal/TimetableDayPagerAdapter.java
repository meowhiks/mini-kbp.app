package com.kbp.journal;

import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.LinearLayout;

import androidx.annotation.NonNull;
import androidx.recyclerview.widget.RecyclerView;

/** Pre-rendered day pages for instant ViewPager2 swipes. */
public final class TimetableDayPagerAdapter extends RecyclerView.Adapter<TimetableDayPagerAdapter.DayHolder> {

    public interface DayBinder {
        int getDayCount();
        void bindDayPage(int dayIndex, LinearLayout pairsContainer, View bottomSpacer);
        int bottomSpacerHeightPx();
    }

    private final DayBinder binder;
    private int dayCount;

    public TimetableDayPagerAdapter(DayBinder binder) {
        this.binder = binder;
        this.dayCount = binder.getDayCount();
    }

    public void refreshDayCount() {
        int next = Math.max(0, binder.getDayCount());
        if (next == dayCount) {
            notifyDataSetChanged();
            return;
        }
        dayCount = next;
        notifyDataSetChanged();
    }

    @NonNull
    @Override
    public DayHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        View view = LayoutInflater.from(parent.getContext())
                .inflate(R.layout.item_timetable_day_page, parent, false);
        // ViewPager2 requires RecyclerView.LayoutParams with MATCH_PARENT — plain
        // ViewGroup.LayoutParams get replaced with wrap_content by RecyclerView.
        view.setLayoutParams(new RecyclerView.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT));
        return new DayHolder(view);
    }

    @Override
    public void onBindViewHolder(@NonNull DayHolder holder, int position) {
        ViewGroup.LayoutParams lp = holder.bottomSpacer.getLayoutParams();
        lp.height = 0;
        if (lp instanceof LinearLayout.LayoutParams) {
            ((LinearLayout.LayoutParams) lp).weight = 1f;
        }
        holder.bottomSpacer.setMinimumHeight(binder.bottomSpacerHeightPx());
        holder.bottomSpacer.setLayoutParams(lp);
        binder.bindDayPage(position, holder.pairsContainer, holder.bottomSpacer);
    }

    @Override
    public int getItemCount() {
        return dayCount;
    }

    static final class DayHolder extends RecyclerView.ViewHolder {
        final LinearLayout pairsContainer;
        final View bottomSpacer;

        DayHolder(@NonNull View itemView) {
            super(itemView);
            pairsContainer = itemView.findViewById(R.id.pairsContainer);
            bottomSpacer = itemView.findViewById(R.id.dayCardBottomSpacer);
        }
    }
}
