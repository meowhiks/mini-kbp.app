package com.kbp.journal;

/** «Фамилия Имя Отчество» — как lib/client/displayNameParts.ts */
public final class DisplayNameHelper {
    public static class Parts {
        public String lastName = "";
        public String firstName = "";
        public String patronymic = "";
    }

    private DisplayNameHelper() {}

    public static Parts parse(String displayName) {
        Parts p = new Parts();
        if (displayName == null) return p;
        String[] parts = displayName.trim().split("\\s+");
        java.util.List<String> list = new java.util.ArrayList<>();
        for (String part : parts) {
            if (!part.isEmpty()) list.add(part);
        }
        if (list.isEmpty()) return p;
        if (list.size() == 1) {
            p.firstName = list.get(0);
            return p;
        }
        if (list.size() == 2) {
            p.lastName = list.get(0);
            p.firstName = list.get(1);
            return p;
        }
        p.lastName = list.get(0);
        p.firstName = list.get(1);
        StringBuilder pat = new StringBuilder();
        for (int i = 2; i < list.size(); i++) {
            if (pat.length() > 0) pat.append(' ');
            pat.append(list.get(i));
        }
        p.patronymic = pat.toString();
        return p;
    }

    public static String compose(Parts parts) {
        StringBuilder sb = new StringBuilder();
        appendPart(sb, parts.lastName);
        appendPart(sb, parts.firstName);
        appendPart(sb, parts.patronymic);
        return sb.toString().trim();
    }

    private static void appendPart(StringBuilder sb, String part) {
        if (part == null || part.trim().isEmpty()) return;
        if (sb.length() > 0) sb.append(' ');
        sb.append(part.trim());
    }

    public static String label(String displayName) {
        if (displayName == null || displayName.trim().isEmpty()) return "Без имени";
        return displayName.trim();
    }

    public static String initial(String displayName, String email) {
        Parts parts = parse(displayName);
        String src = parts.firstName;
        if (src.isEmpty()) src = parts.lastName;
        if (src.isEmpty()) src = displayName != null ? displayName : "";
        if (src.isEmpty()) src = email != null ? email : "?";
        return src.substring(0, 1).toUpperCase(java.util.Locale.ROOT);
    }
}
