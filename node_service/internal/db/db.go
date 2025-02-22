package database

import (
	"fmt"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"log"
	"os"
)

func DbConn() *gorm.DB {
	db, err := gorm.Open(
		postgres.Open(Dsn()), &gorm.Config{},
	)
	if err != nil {
		log.Fatalf("There was error connecting to the database: %v", err)
	}
	return db
}

func Dsn() string {
	var (
		username = os.Getenv("DB_USER")
		password = os.Getenv("DB_PASSWORD")
		name     = os.Getenv("DB_NAME")
		host     = os.Getenv("DB_HOST")
		port     = os.Getenv("DB_PORT")
	)
	return fmt.Sprintf("%s:%s@tcp(%s:%s)/%s", username, password, host, port, name)
}
