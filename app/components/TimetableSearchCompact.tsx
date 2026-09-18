"use client";

import { useState, useEffect, useRef, useCallback, type ReactNode } from "react";
import {
  searchTimetable,
  fetchTimetableByCategory,
  listTimetableEntities,
  forceRebuildSearchIndex,
  type SearchResult,
} from "@/lib/client/searchApi";
import { storageGet, storageSet } from "@/lib/client/storage";
import { isNativeApp } from "@/lib/client/platform";
import { AppInputField, appInputClass } from "@/app/components/app/AppInputField";
import { shouldKeepSearchDropdownClosed } from "@/lib/client/searchDropdown";
import { themeIsDark } from "@/lib/client/appTheme";

interface TimetableSearchCompactProps {
  onSelectResult?: (result: SearchResult, timetableData: any) => void;
  variant?: "default" | "nav" | "pc";
  onEnterNavigate?: () => void;
  theme?: "light" | "oled" | "dark";
  className?: string;
  /** Кнопка справа от поля (на одной линии с инпутом, не перекрывает «Недавние»). */
  trailingAction?: ReactNode;
}

const RECENT_SEARCHES_KEY = "recent_timetable_searches_v1";
const MAX_RECENT = 5;

export default function TimetableSearchCompact({
  onSelectResult,
  variant = "default",
  onEnterNavigate,
  theme = "light",
  className = "",
  trailingAction,
}: TimetableSearchCompactProps) {
  const isNav = variant === "nav";
  const isPc = variant === "pc";
  const isDark = themeIsDark(theme);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [allResults, setAllResults] = useState<SearchResult[]>([]);
  const [displayLimit, setDisplayLimit] = useState(80);
  const [loading, setLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [recentSearches, setRecentSearches] = useState<SearchResult[]>([]);
  const [rebuildProgress, setRebuildProgress] = useState(0);
  const [isRebuilding, setIsRebuilding] = useState(false);
  const pickedLabelRef = useRef<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const recentScrollRef = useRef<HTMLDivElement>(null);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const progressInterval = useRef<NodeJS.Timeout | null>(null);

  // Load recent searches on mount
  useEffect(() => {
    const loadRecent = async () => {
      const saved = await storageGet(RECENT_SEARCHES_KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            setRecentSearches(parsed);
          }
        } catch {}
      }
    };
    loadRecent();
  }, []);

  // Handle click outside (pointerdown so mobile taps on results aren't raced by mousedown)
  useEffect(() => {
    const handleClickOutside = (event: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener("pointerdown", handleClickOutside);
    return () => document.removeEventListener("pointerdown", handleClickOutside);
  }, []);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (longPressTimer.current) clearTimeout(longPressTimer.current);
      if (progressInterval.current) clearInterval(progressInterval.current);
    };
  }, []);

  // Debounced search
  const debouncedSearch = useCallback(
    async (searchQuery: string) => {
      if (shouldKeepSearchDropdownClosed(searchQuery, pickedLabelRef.current)) {
        setShowResults(false);
        setLoading(false);
        return;
      }
      if (searchQuery.trim().length < 1) {
        setResults(allResults.slice(0, displayLimit));
        setShowResults(true);
        return;
      }

      setLoading(true);
      try {
        const searchResults = await searchTimetable(searchQuery);
        const normalizedQuery = searchQuery.trim().toLowerCase();
        const sorted = searchResults.sort((a, b) => {
          const aStarts = a.name.toLowerCase().startsWith(normalizedQuery);
          const bStarts = b.name.toLowerCase().startsWith(normalizedQuery);
          if (aStarts !== bStarts) return aStarts ? -1 : 1;
          return a.name.localeCompare(b.name, "ru");
        });
        setResults(sorted);
        setShowResults(true);
      } catch (err) {
        console.error("Search error:", err);
      } finally {
        setLoading(false);
      }
    },
    [allResults, displayLimit]
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      debouncedSearch(query);
    }, 300);
    return () => clearTimeout(timer);
  }, [query, debouncedSearch]);

  const saveRecentSearch = async (result: SearchResult) => {
    const newRecent = [
      result,
      ...recentSearches.filter((r) => !(r.id === result.id && r.type === result.type)),
    ].slice(0, MAX_RECENT);
    setRecentSearches(newRecent);
    await storageSet(RECENT_SEARCHES_KEY, JSON.stringify(newRecent));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onEnterNavigate?.();
      if (results.length > 0 && !loading) {
        void handleSelectResult(results[0]);
      }
    }
  };

  const handleSelectResult = async (result: SearchResult) => {
    pickedLabelRef.current = result.name;
    setShowResults(false);
    setQuery(result.name);

    // Save to recent searches
    await saveRecentSearch(result);

    if (onSelectResult) {
      onSelectResult(result, null);
    }
  };

  const handleSelectFromRecent = async (result: SearchResult) => {
    pickedLabelRef.current = result.name;
    setShowResults(false);
    setQuery(result.name);
    await saveRecentSearch(result);

    if (onSelectResult) {
      onSelectResult(result, null);
    }
  };

  const removeFromRecent = async (e: React.MouseEvent, result: SearchResult) => {
    e.stopPropagation();
    const filtered = recentSearches.filter(
      (r) => !(r.id === result.id && r.type === result.type)
    );
    setRecentSearches(filtered);
    await storageSet(RECENT_SEARCHES_KEY, JSON.stringify(filtered));
  };

  // Long press handlers for search icon
  const startLongPress = () => {
    if (!isNativeApp()) return;

    setRebuildProgress(0);
    setIsRebuilding(true);

    progressInterval.current = setInterval(() => {
      setRebuildProgress((prev) => {
        if (prev >= 100) {
          if (progressInterval.current) clearInterval(progressInterval.current);
          return 100;
        }
        return prev + 3.33;
      });
    }, 100);

    longPressTimer.current = setTimeout(() => {
      triggerRebuild();
    }, 3000);
  };

  const cancelLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    if (progressInterval.current) {
      clearInterval(progressInterval.current);
      progressInterval.current = null;
    }
    setIsRebuilding(false);
    setRebuildProgress(0);
  };

  const triggerRebuild = async () => {
    if (progressInterval.current) clearInterval(progressInterval.current);
    setRebuildProgress(100);

    const result = await forceRebuildSearchIndex();

    if (result.success) {
      const items = await listTimetableEntities();
      setAllResults(items);
      setResults(items.slice(0, displayLimit));
      setShowResults(true);
      alert(`Индекс обновлен! Загружено ${result.count} записей.`);
    } else {
      alert(`Ошибка обновления: ${result.error || "Неизвестная ошибка"}`);
    }

    setIsRebuilding(false);
    setRebuildProgress(0);
  };

  return (
    <div
      ref={containerRef}
      className={`relative min-w-0 ${
        isPc
          ? `flex shrink-0 flex-col items-stretch gap-1.5 ${trailingAction ? "w-[360px]" : "w-[310px]"}`
          : "w-full"
      } ${className}`}
    >
      {/* Search Input */}
      <div className={`flex min-w-0 items-center gap-2 ${isPc ? "w-full shrink-0" : "w-full"}`}>
        <div className={`relative min-w-0 flex-1`}>
        <AppInputField
          icon={
            <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          }
        >
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              pickedLabelRef.current = null;
              setQuery(e.target.value);
            }}
            onFocus={() => {
              setShowResults(true);
              if (!query.trim() && allResults.length === 0) {
                setLoading(true);
                listTimetableEntities()
                  .then((items) => {
                    setAllResults(items);
                    setDisplayLimit(120);
                    setResults(items.slice(0, 120));
                  })
                  .catch((err) => console.error("Index load error:", err))
                  .finally(() => setLoading(false));
              } else if (!query.trim()) {
                setResults(allResults.slice(0, displayLimit));
              }
            }}
            onKeyDown={handleKeyDown}
            placeholder={isNav ? "Поиск…" : "Найдите расписание"}
            className={
              isNav
                ? "w-full rounded-xl border-0 bg-black/[0.04] py-2 pl-11 pr-9 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:bg-white focus:ring-2 focus:ring-[var(--app-accent-ring)] dark:bg-white/10 dark:text-zinc-100 dark:placeholder-zinc-500 dark:focus:bg-zinc-900"
                : appInputClass(isDark)
            }
          />
        </AppInputField>
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          {loading ? (
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-[var(--app-accent)]" />
          ) : isNav ? null : (
            <button
              onMouseDown={startLongPress}
              onMouseUp={cancelLongPress}
              onMouseLeave={cancelLongPress}
              onTouchStart={startLongPress}
              onTouchEnd={cancelLongPress}
              className="relative"
              title={isNativeApp() ? "Удерживайте 3 сек для обновления базы" : "Поиск"}
            >
              {isRebuilding && (
                <span className="absolute -inset-1 rounded-full border-2 border-[var(--app-accent-ring)]" />
              )}
            </button>
          )}
        </div>

        {/* Results Dropdown */}
        {showResults && results.length > 0 && (
          <div
            className="absolute top-full left-0 right-0 z-50 mt-2 max-h-80 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
            onScroll={(e) => {
              if (query.trim()) return;
              const el = e.currentTarget;
              if (el.scrollTop + el.clientHeight >= el.scrollHeight - 80) {
                setDisplayLimit((prev) => {
                  const next = Math.min(allResults.length || prev + 200, prev + 200);
                  if (next !== prev) setResults(allResults.slice(0, next));
                  return next;
                });
              }
            }}
          >
            {results.map((result, index) => (
              <button
                key={`${result.type}-${result.id}-${index}`}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSelectResult(result)}
                className="flex w-full items-center gap-3 border-b border-gray-100 px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-gray-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-gray-900 dark:text-zinc-100">{result.name}</div>
                </div>
              </button>
            ))}
            {!query.trim() && allResults.length > 0 && results.length < allResults.length && (
              <div className="px-4 py-3 text-center text-xs text-gray-400 dark:text-zinc-500">
                Показано {results.length} из {allResults.length}. Листай вниз…
              </div>
            )}
          </div>
        )}

        {/* No Results */}
        {showResults && query.trim().length >= 1 && !loading && results.length === 0 && (
          <div className="absolute top-full left-0 right-0 z-50 mt-2 rounded-xl border border-gray-200 bg-white p-4 text-center text-gray-500 shadow-lg dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
            Ничего не найдено
          </div>
        )}
        </div>
        {trailingAction ? <div className="shrink-0 self-center">{trailingAction}</div> : null}
      </div>

      {/* Recent Searches */}
      {!isNav && recentSearches.length > 0 && (
        <div className={isPc ? "flex max-w-full flex-wrap items-center gap-1.5" : "mt-3"}>
          {!isPc ? <div className="mb-2 text-xs text-gray-500 dark:text-zinc-400">Недавние:</div> : null}
          <div
            ref={recentScrollRef}
            className={
              isPc
                ? "flex max-w-full flex-wrap items-center gap-1.5"
                : "flex gap-2 overflow-x-auto scrollbar-hide pb-2"
            }
            style={isPc ? undefined : { scrollbarWidth: "none", msOverflowStyle: "none" }}
          >
            {recentSearches.map((result) => (
              <button
                key={`${result.type}-${result.id}`}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSelectFromRecent(result)}
                className={
                  isPc
                    ? "flex shrink-0 items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                    : "flex-shrink-0 flex items-center gap-2 bg-white dark:bg-zinc-900 hover:bg-gray-50 dark:hover:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl px-3 py-2 transition-colors"
                }
              >
                <span className={`font-medium text-gray-700 dark:text-zinc-200 whitespace-nowrap ${isPc ? "text-xs" : "text-sm"}`}>
                  {result.name}
                </span>
                <span
                  onClick={(e) => removeFromRecent(e, result)}
                  className="cursor-pointer text-sm leading-none text-gray-400 hover:text-red-500 dark:text-zinc-500"
                >
                  ×
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
