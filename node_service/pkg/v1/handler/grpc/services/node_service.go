package services

import (
	"github.com/MortierEsteban/dungeons-space-backend/node_service/pkg/v1/handler/grpc"
	pb "github.com/MortierEsteban/dungeons-space-backend/node_service/proto/gen"
)

type NodeService struct {
	template grpc.NodeService
	pb.UnimplementedNodeServiceServer
}
