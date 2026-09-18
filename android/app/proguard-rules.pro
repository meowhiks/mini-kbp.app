# Capacitor / WebView
-keep class com.getcapacitor.** { *; }
-keep class org.apache.cordova.** { *; }
-dontwarn com.getcapacitor.**
-keepattributes *Annotation*
-keepclassmembers class * {
    @com.getcapacitor.PluginMethod public *;
}
