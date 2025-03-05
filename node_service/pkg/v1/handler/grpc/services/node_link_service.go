package services

import (
	"context"
	"github.com/MortierEsteban/dungeons-space-backend/node_service/internal/models"
	repo "github.com/MortierEsteban/dungeons-space-backend/node_service/pkg/v1/repositories/node"
	"github.com/MortierEsteban/dungeons-space-backend/node_service/pkg/v1/usecase"
	pb "github.com/MortierEsteban/dungeons-space-backend/node_service/proto/gen"
	"google.golang.org/grpc"
	"gorm.io/gorm"
)

type NodeLinkServStruct struct {
	useCase usecase.NodeLinkUseCase
	pb.UnimplementedNodeLinkServiceServer
}

func NewNodeLinkServer(grpcServer *grpc.Server, db *gorm.DB) {
	NodeLinkGrpc := &NodeLinkServStruct{useCase: initNodeLinkServer(db)}
	pb.RegisterNodeLinkServiceServer(grpcServer, NodeLinkGrpc)
}
func initNodeLinkServer(db *gorm.DB) usecase.NodeLinkUseCase {
	nodeLinkRepository := repo.NewNodeLinkRepository(db)
	return usecase.NewNodeLinkUseCase(*nodeLinkRepository)
}

// Create
//
// This function creates a NodeLink whose data is supplied
// through the CreateNodeLinkRequest message of proto
func (srv *NodeLinkServStruct) Create(ctx context.Context, req *pb.CreateNodeLinkRequest) (*pb.SuccessResponse, error) {
	data := srv.transformNodeLinkRPC(req)

	NodeLink, err := srv.useCase.Create(data)
	if err != nil {
		return &pb.SuccessResponse{}, err
	}
	return &pb.SuccessResponse{
		Response: "NodeLink SuccessFullyCreated",
		Id:       int64(NodeLink.ID),
	}, nil
}

// Delete
//
// This function deletes a NodeLink instance specified by its ID,
// which is provided in the DeleteNodeLinkRequest message of proto.
func (srv *NodeLinkServStruct) Delete(ctx context.Context, req *pb.SingleNodeLinkRequest) (*pb.SuccessResponse, error) {
	id := req.GetId()
	err := srv.useCase.Delete(uint(id))
	if err != nil {
		return nil, err
		return &pb.SuccessResponse{
			Response: "NodeLink Successfully Deleted",
			Id:       int64(id),
		}, nil
	}
	return &pb.SuccessResponse{
		Response: "NodeLink Successfully Deleted",
		Id:       0,
	}, nil
}

// Get
//
// This function returns the NodeLink instance of which ID
// is supplied through the SingleNodeLinkRequest message field of proto
func (srv *NodeLinkServStruct) Get(ctx context.Context, req *pb.SingleNodeLinkRequest) (*pb.NodeLinkResponse, error) {
	id := req.GetId()
	NodeLink, err := srv.useCase.Get(uint(id))
	if err != nil {
		return &pb.NodeLinkResponse{}, err
	}
	return srv.transformNodeLinkModel(NodeLink), nil
}

func (srv *NodeLinkServStruct) transformNodeLinkRPC(req *pb.CreateNodeLinkRequest) models.NodeLink {
	return models.NodeLink{
		Model:       gorm.Model{},
		NodeId:      int(req.NodeId),
		LinkId:      int(req.LinkId),
		Description: &req.Description,
		Magnitude:   uint(req.Magnitude),
		Colour:      req.Colour,
	}
}

func (srv *NodeLinkServStruct) transformNodeLinkModel(NodeLink models.NodeLink) *pb.NodeLinkResponse {
	return &pb.NodeLinkResponse{
		Id:     uint64(NodeLink.ID),
		NodeId: int64(NodeLink.NodeId),
		LinkId: int64(NodeLink.LinkId),
		Description: func() string {
			if NodeLink.Description != nil {
				return *NodeLink.Description
			}
			return ""
		}(),
		Magnitude: uint64(NodeLink.Magnitude),
		Colour:    NodeLink.Colour,
	}
}
