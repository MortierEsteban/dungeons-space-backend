package models

import "gorm.io/gorm"

const (
	NODE_SERVICE_PLACE     = "PLACE"
	NODE_SERVICE_CHARACTER = "CHARACTER"
	NODE_SERVICE_ITEM      = "ITEM"
	NODE_SERVICE_EVENT     = "EVENT"

	NODE_TYPE
)

type Node struct {
	gorm.Model

	Name          string
	Description   *string
	Links         []Node `gorm:"many2many:node_links"`
	ReferencedId  *uint
	PlayerVisible bool `gorm:"default:false; not null"`
	Service       string
}

type NodeLink struct {
	gorm.Model

	NodeId int `gorm:"primaryKey"`
	LinkId int `gorm:"primaryKey"`
	// Add a ForeignKey constraint explicitly if needed
	Node Node `gorm:"foreignKey:NodeId;references:ID"`
	Link Node `gorm:"foreignKey:LinkId;references:ID"`

	Description *string
	Magnitude   uint   `gorm:"default:1;not null"`
	Colour      string `gorm:"size:7;default:'#000000';not null"`
}
