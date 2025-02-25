package repository

import (
	"gorm.io/gorm"
)

// Define a generic repository interface
type Repository[T any] interface {
	Create(item *T) error
	GetByID(id uint) (*T, error)
	GetAll() ([]T, error)
	Update(item *T) error
	Delete(id uint) error
}

// Generic repository implementation
type GormRepository[T any] struct {
	Db *gorm.DB
}

func NewGormRepository[T any](db *gorm.DB) *GormRepository[T] {
	return &GormRepository[T]{Db: db}
}

// Implement methods for gormRepository
func (r *GormRepository[T]) Create(item *T) error {
	return r.Db.Create(item).Error
}

func (r *GormRepository[T]) GetByID(id uint) (*T, error) {
	var item T
	err := r.Db.First(&item, id).Error
	return &item, err
}

func (r *GormRepository[T]) GetAll() ([]T, error) {
	var items []T
	err := r.Db.Find(&items).Error
	return items, err
}

func (r *GormRepository[T]) Update(item *T) error {
	return r.Db.Save(item).Error
}

func (r *GormRepository[T]) Delete(id uint) error {
	return r.Db.Delete(new(T), id).Error
}
