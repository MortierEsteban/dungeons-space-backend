package services

import (
	"context"
	"errors"
	"github.com/MortierEsteban/dungeons-space-backend/node_service/internal/models"
	repo "github.com/MortierEsteban/dungeons-space-backend/node_service/pkg/v1/repositories/node"
	"github.com/MortierEsteban/dungeons-space-backend/node_service/pkg/v1/usecase"
	pb "github.com/MortierEsteban/dungeons-space-backend/node_service/proto/gen"
	"google.golang.org/grpc"
	"gorm.io/gorm"
)

type NodeServStruct struct {
	useCase usecase.NodeUseCase
	pb.UnimplementedNodeServiceServer
}

func NewServer(grpcServer *grpc.Server, db *gorm.DB) {
	NodeGrpc := &NodeServStruct{useCase: initNodeServer(db)}
	pb.RegisterNodeServiceServer(grpcServer, NodeGrpc)
}

func initNodeServer(db *gorm.DB) usecase.NodeUseCase {
	nodeRepository := repo.NewNodeRepository(db)
	return usecase.NewNodeUseCase(*nodeRepository)
}

// Create
//
// This function creates a Node whose data is supplied
// through the CreateNodeRequest message of proto
func (srv *NodeServStruct) Create(ctx context.Context, req *pb.NodeRequest) (*pb.SuccessResponse, error) {
	data := srv.transformNodeRPC(req)
	if data.Name == "" {
		return &pb.SuccessResponse{}, errors.New("please provide all fields")
	}

	Node, err := srv.useCase.Create(data)
	if err != nil {
		return &pb.SuccessResponse{}, err
	}
	return &pb.SuccessResponse{
		Response: "Node SuccessFullyCreated",
		Id:       int64(Node.ID),
	}, nil
}

// FindNodeById
//
// This function retrieves a node by its ID, which is provided
// through the FindNodeByIdRequest message of proto.
func (srv *NodeServStruct) FindNodeById(ctx context.Context, req *pb.SingleNodeRequest) (*pb.NodeResponse, error) {
	id := req.GetId()
	Node, err := srv.useCase.Get(uint(id))
	if err != nil {
		println(err.Error())
		return nil, err
	}
	return srv.transformNodeModel(Node), nil
}

// Get
//
// This function returns the Node instance of which ID
// is supplied through the SingleNodeRequest message field of proto
func (srv *NodeServStruct) Get(ctx context.Context, req *pb.SingleNodeRequest) (*pb.NodeResponse, error) {
	id := req.GetId()
	Node, err := srv.useCase.Get(uint(id))
	if err != nil {
		return &pb.NodeResponse{}, err
	}
	return srv.transformNodeModel(Node), nil
}

func (srv *NodeServStruct) transformNodeRPC(req *pb.NodeRequest) models.Node {
	linkedNodes, _ := srv.useCase.FindAllLinks(req.Links)
	ref := uint(req.ReferencedId)
	return models.Node{
		Name:          req.GetName(),
		Description:   &req.Description,
		Links:         linkedNodes,
		ReferencedId:  &ref,
		PlayerVisible: req.PlayerVisible,
		Service:       req.Service,
	}
}

func (srv *NodeServStruct) transformNodeModel(Node models.Node) *pb.NodeResponse {
	// Handle optional ReferencedId conversion
	var refID uint64
	if Node.ReferencedId != nil {
		val := uint64(*Node.ReferencedId) // Convert uint -> uint64
		refID = val
	}

	// Handle optional Description safely
	var description string
	if Node.Description != nil {
		description = *Node.Description
	}

	// Convert Links (Prevent infinite recursion with depth control)
	var links []*pb.NodeResponse
	if Node.Links != nil {
		links = make([]*pb.NodeResponse, len(Node.Links))
		for i, link := range Node.Links {
			links[i] = srv.transformNodeModel(link) // Recursive conversion
		}
	}

	return &pb.NodeResponse{
		Id:            int64(Node.ID),
		Name:          Node.Name,
		Service:       Node.Service,
		Links:         links,
		Description:   description, // Use safe assignment instead of dereferencing a pointer
		ReferencedId:  refID,       // Use pointer directly
		PlayerVisible: Node.PlayerVisible,
	}
}
