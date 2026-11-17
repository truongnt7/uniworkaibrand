# SPDX-License-Identifier: GPL-3.0-or-later
"""Giao thức stdout JSON-lines của worker (mỗi sự kiện = một dòng JSON)."""
import json
import os
import sys

_STDOUT_FD = 1


def emit(event_type, **fields):
    """In một sự kiện. Dòng luôn bắt đầu bằng '\\n' để không dính vào dòng dở dang
    mà bộ đệm C của Blender (banner, 'Fra:1 Mem:...') có thể đang giữ trên cùng một pipe."""
    payload = {"type": event_type}
    payload.update(fields)
    data = ("\n" + json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8")
    try:
        sys.stdout.flush()
    except Exception:
        pass
    os.write(_STDOUT_FD, data)


def log(message, level="info"):
    emit("log", level=level, message=str(message))


def warning(code, message):
    emit("warning", code=code, message=message)


def error(code, message, detail=None):
    if detail is None:
        emit("error", code=code, message=message)
    else:
        emit("error", code=code, message=message, detail=detail)


class WorkerError(Exception):
    """Lỗi có mã ổn định (xem WORKER_ERROR_CODES trong packages/shared)."""

    def __init__(self, code, message, detail=None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.detail = detail
