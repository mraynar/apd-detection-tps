import datetime
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship

db = SQLAlchemy()


def utc_now():
    return datetime.datetime.now(datetime.timezone.utc)


class User(db.Model):
    __tablename__ = 'users'

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(100), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(50), nullable=False)  # 'admin' or 'user'
    created_at = Column(DateTime, default=utc_now)
    sessions = relationship("Session", back_populates="user", cascade="all, delete-orphan")
    cameras = relationship("Camera", back_populates="owner", cascade="all, delete-orphan")


class Session(db.Model):
    __tablename__ = 'sessions'

    token = Column(String(255), primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    role = Column(String(50), nullable=False)
    created_at = Column(DateTime, default=utc_now)
    expires_at = Column(DateTime, nullable=False)
    user = relationship("User", back_populates="sessions")


class Camera(db.Model):
    __tablename__ = 'cameras'

    id = Column(Integer, primary_key=True, autoincrement=True)
    owner_user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    label = Column(String(255), nullable=False)
    
    # source identification redesign
    source_type = Column(String(50), default="webcam", nullable=False) # 'webcam' or 'rtsp'
    use_rtsp = Column(Boolean, default=False, nullable=False) # kept for backward compatibility
    rtsp_url = Column(String(500), nullable=True)
    camera_index = Column(Integer, nullable=True)
    
    created_at = Column(DateTime, default=utc_now)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)

    owner = relationship("User", back_populates="cameras")


class Violation(db.Model):
    __tablename__ = 'violations'

    id = Column(String(255), primary_key=True)
    timestamp = Column(String(255), nullable=False)
    label = Column(String(100), nullable=False)
    confidence = Column(Float, nullable=False)
    camera_source = Column(String(255), nullable=False)
    is_violation = Column(Boolean, default=True)
    created_at = Column(DateTime, default=utc_now)
