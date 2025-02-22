package database

import (
	"fmt"
	"os"
)

//func DbConn() *gorm.DB {
//	db, err := gorm.Open(
//		postgres.Open(Dsn()), &gorm.Config{},
//	)
//	if err != nil {
//		log.Fatalf("There was error connecting to the database: %v", err)
//	}
//	return db
//}

func Dsn() string {
	var (
		username = os.Getenv("POSTGRES_USER")
		password = os.Getenv("POSTGRES_PASSWORD")
		name     = os.Getenv("POSTGRES_DB")
		host     = os.Getenv("POSTGRES_HOST")
		port     = os.Getenv("POSTGRES_PORT")
	)
	return fmt.Sprintf("%s:%s@tcp(%s:%s)/%s", username, password, host, port, name)
}
