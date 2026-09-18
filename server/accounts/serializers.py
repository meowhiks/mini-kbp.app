from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password

from .models import Teacher, Student, AppAccount

User = get_user_model()


class TeacherSerializer(serializers.ModelSerializer):
    """Полный профиль учителя — для админских запросов."""

    username = serializers.CharField(source="user.username", read_only=True)

    class Meta:
        model = Teacher
        fields = [
            "id",
            "username",
            "full_name",
            "email",
            "phone",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class TeacherCreateSerializer(serializers.ModelSerializer):
    """
    Назначение преподавателя: выберите app_account_id (пользователь уже зарегистрирован в /app)
    или укажите username + password (legacy).
    """

    username = serializers.CharField(write_only=True, required=False)
    password = serializers.CharField(write_only=True, required=False, validators=[validate_password])
    app_account_id = serializers.IntegerField(write_only=True, required=False)

    class Meta:
        model = Teacher
        fields = ["full_name", "email", "phone", "username", "password", "app_account_id"]

    def validate(self, attrs):
        app_id = attrs.get("app_account_id")
        username = attrs.get("username")
        password = attrs.get("password")
        if app_id:
            return attrs
        if username and password:
            return attrs
        raise serializers.ValidationError(
            "Выберите пользователя из списка или укажите логин и пароль"
        )

    def create(self, validated_data):
        app_id = validated_data.pop("app_account_id", None)
        username = validated_data.pop("username", None)
        password = validated_data.pop("password", None)

        if app_id:
            try:
                account = AppAccount.objects.select_related("user").get(pk=app_id)
            except AppAccount.DoesNotExist:
                raise serializers.ValidationError({"app_account_id": "Пользователь не найден"})
            user = account.user
            if Teacher.objects.filter(user=user).exists():
                raise serializers.ValidationError({"app_account_id": "Уже назначен преподавателем"})
            full_name = validated_data.get("full_name") or account.display_name or account.email or user.username
            email = validated_data.get("email") or account.email or ""
            return Teacher.objects.create(
                user=user,
                full_name=full_name,
                email=email,
                phone=validated_data.get("phone") or account.phone or "",
            )

        user = User.objects.create_user(
            username=username,
            password=password,
            email=validated_data.get("email", ""),
        )
        return Teacher.objects.create(user=user, **validated_data)


class StudentCreateSerializer(serializers.ModelSerializer):
    """Создание студента: из зарегистрированного пользователя /app или вручную."""

    app_account_id = serializers.IntegerField(write_only=True, required=False)

    class Meta:
        model = Student
        fields = [
            "full_name",
            "record_book_number",
            "birth_date",
            "email",
            "phone",
            "app_account_id",
        ]

    def validate(self, attrs):
        if attrs.get("app_account_id"):
            return attrs
        if not attrs.get("full_name") or not attrs.get("record_book_number"):
            raise serializers.ValidationError("Укажите пользователя или ФИО и номер зачётки")
        return attrs

    def create(self, validated_data):
        app_id = validated_data.pop("app_account_id", None)
        if app_id:
            try:
                account = AppAccount.objects.select_related("user", "student").get(pk=app_id)
            except AppAccount.DoesNotExist:
                raise serializers.ValidationError({"app_account_id": "Пользователь не найден"})
            if account.student_id or Student.objects.filter(user=account.user).exists():
                raise serializers.ValidationError({"app_account_id": "Уже есть профиль студента"})

            full_name = validated_data.get("full_name") or account.display_name or account.email or "Студент"
            rb = validated_data.get("record_book_number") or f"APP-{account.id}"
            n = 0
            base = rb
            while Student.objects.filter(record_book_number=rb).exists():
                n += 1
                rb = f"{base}-{n}"

            student = Student.objects.create(
                user=account.user,
                full_name=full_name,
                record_book_number=rb,
                birth_date=validated_data.get("birth_date"),
                email=validated_data.get("email") or account.email or "",
                phone=validated_data.get("phone") or account.phone or "",
            )
            account.student = student
            account.save(update_fields=["student"])
            return student

        return Student.objects.create(**validated_data)


class TeacherBriefSerializer(serializers.ModelSerializer):
    """Краткий сериализатор для вложенных ответов."""

    class Meta:
        model = Teacher
        fields = ["id", "full_name"]


class StudentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Student
        fields = [
            "id",
            "full_name",
            "record_book_number",
            "birth_date",
            "email",
            "phone",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class StudentBriefSerializer(serializers.ModelSerializer):
    class Meta:
        model = Student
        fields = ["id", "full_name", "record_book_number"]