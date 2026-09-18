from rest_framework import serializers
from .models import Group, Subject, Enrollment, TeachingAssignment, Grade
from accounts.models import Teacher
from accounts.serializers import (
    TeacherBriefSerializer,
    StudentBriefSerializer,
)


class GroupSerializer(serializers.ModelSerializer):
    student_count = serializers.SerializerMethodField()

    class Meta:
        model = Group
        fields = [
            "id",
            "name",
            "description",
            "is_active",
            "student_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_student_count(self, obj: Group) -> int:
        return obj.enrollments.filter(is_active=True).count()


class SubjectSerializer(serializers.ModelSerializer):
    teacher_ids = serializers.PrimaryKeyRelatedField(
        many=True,
        queryset=Teacher.objects.filter(is_active=True),
        source="teachers",
        required=False,
    )

    class Meta:
        model = Subject
        fields = [
            "id",
            "name",
            "short_name",
            "description",
            "is_active",
            "teacher_ids",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class EnrollmentSerializer(serializers.ModelSerializer):
    student_detail = StudentBriefSerializer(source="student", read_only=True)
    group_detail = GroupSerializer(source="group", read_only=True)

    class Meta:
        model = Enrollment
        fields = [
            "id",
            "student",
            "group",
            "student_detail",
            "group_detail",
            "enrolled_at",
            "is_active",
        ]
        read_only_fields = ["id", "enrolled_at"]

    def validate(self, attrs):
        # Проверка уникальности на уровне сериализатора
        student = attrs.get("student")
        group = attrs.get("group")
        if student and group:
            qs = Enrollment.objects.filter(student=student, group=group)
            if self.instance:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                raise serializers.ValidationError(
                    "Этот студент уже зачислен в данную группу."
                )
        return attrs


class TeachingAssignmentSerializer(serializers.ModelSerializer):
    teacher_detail = TeacherBriefSerializer(source="teacher", read_only=True)
    group_detail = GroupSerializer(source="group", read_only=True)
    subject_detail = SubjectSerializer(source="subject", read_only=True)

    class Meta:
        model = TeachingAssignment
        fields = [
            "id",
            "teacher",
            "group",
            "subject",
            "lesson_type",
            "hours_per_week",
            "semester",
            "is_active",
            "teacher_detail",
            "group_detail",
            "subject_detail",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate(self, attrs):
        teacher = attrs.get("teacher")
        group = attrs.get("group")
        subject = attrs.get("subject")
        lesson_type = attrs.get("lesson_type")
        if teacher and group and subject and lesson_type:
            qs = TeachingAssignment.objects.filter(
                teacher=teacher,
                group=group,
                subject=subject,
                lesson_type=lesson_type,
            )
            if self.instance:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                raise serializers.ValidationError(
                    "Такое назначение уже существует."
                )
        return attrs


class GradeSerializer(serializers.ModelSerializer):
    student_detail = StudentBriefSerializer(source="student", read_only=True)
    assignment_detail = TeachingAssignmentSerializer(source="assignment", read_only=True)

    class Meta:
        model = Grade
        fields = [
            "id",
            "assignment",
            "student",
            "date",
            "slot",
            "value",
            "comment",
            "student_detail",
            "assignment_detail",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate(self, attrs):
        assignment = attrs.get("assignment") or getattr(self.instance, "assignment", None)
        student = attrs.get("student") or getattr(self.instance, "student", None)
        date = attrs.get("date") or getattr(self.instance, "date", None)
        slot = attrs.get("slot")
        if slot is None and self.instance is not None:
            slot = self.instance.slot
        if slot is None:
            slot = 0
        if assignment and student and date is not None:
            qs = Grade.objects.filter(
                assignment=assignment,
                student=student,
                date=date,
                slot=slot,
            )
            if self.instance:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                raise serializers.ValidationError(
                    "Отметка для этого урока в этот день уже существует."
                )
        return attrs