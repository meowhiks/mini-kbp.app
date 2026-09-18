from rest_framework import serializers

from .models import JournalDay, LatenessRecord, GroupCurator


class JournalDaySerializer(serializers.ModelSerializer):
    class Meta:
        model = JournalDay
        fields = ["id", "assignment", "date", "slot", "day_type", "footer_note", "lab_due_date", "lab_credited", "red_absent"]
        read_only_fields = ["id"]


class LatenessRecordSerializer(serializers.ModelSerializer):
    class Meta:
        model = LatenessRecord
        fields = ["id", "group", "student", "date", "slot", "minutes"]
        read_only_fields = ["id"]


class GroupCuratorSerializer(serializers.ModelSerializer):
    class Meta:
        model = GroupCurator
        fields = ["id", "teacher", "group"]
        read_only_fields = ["id"]
