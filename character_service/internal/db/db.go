package database

import (
	"fmt"
	"github.com/MortierEsteban/dungeons-space-backend/character_service/internal/models"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"log"
	"os"
)

func DbConn() *gorm.DB {
	var (
		username = os.Getenv("POSTGRES_USER")
		password = os.Getenv("POSTGRES_PASSWORD")
		name     = os.Getenv("POSTGRES_DB")
		host     = os.Getenv("POSTGRES_HOST")
		port     = os.Getenv("POSTGRES_PORT")
	)
	db, err := gorm.Open(postgres.New(postgres.Config{
		DSN:                  fmt.Sprintf("host=%s user=%s password=%s dbname=%s port=%s sslmode=disable", host, username, password, name, port), // data source name, refer https://github.com/jackc/pgx
		PreferSimpleProtocol: true,                                                                                                               // disables implicit prepared statement usage. By default pgx automatically uses the extended protocol
	}), &gorm.Config{})
	if err != nil {
		log.Fatalf("There was error connecting to the database: %v", err)
	}
	return db
}

func Migrations(db *gorm.DB) {
	err := db.AutoMigrate(
		&models.Character{},
		&models.AbilityScores{},
		&models.Item{},
		&models.Weapon{},
		&models.Consumable{},
		&models.Armor{},
		&models.Miscellaneous{},
	)

	if err != nil {
		fmt.Println(err)
	} else {
		fmt.Println("Migrated")
	}
}

//func Dsn() string {
//
//	return fmt.Sprintf("postgres://%s:%s@tcp(%s:%s)/%s", username, password, host, port, name)
//}
